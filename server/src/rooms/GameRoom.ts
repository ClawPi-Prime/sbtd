import { Room, Client } from 'colyseus';
import { GameState } from '../schemas/GameState';
import { PlayerState } from '../schemas/PlayerState';
import { UnitState } from '../schemas/UnitState';
import { UNIT_DEFS } from '../unitDefs';

interface PlaceUnitMsg {
  type: string;
  col: number;
  row: number;
}

export class GameRoom extends Room<GameState> {
  maxClients = 2;
  private buildTimerInterval: ReturnType<typeof setInterval> | null = null;
  private voteStartSet = new Set<string>();

  onCreate(_options: Record<string, unknown>): void {
    this.setState(new GameState());
    console.log('[GameRoom] Created');

    this.onMessage('game:placeUnit', (client, message: PlaceUnitMsg) => {
      if (this.state.phase !== 'build') {
        client.send('error', { message: 'Not in build phase' });
        return;
      }

      const player = this.state.players.get(client.sessionId);
      if (!player) return;

      const def = UNIT_DEFS[message.type];
      if (!def) {
        client.send('error', { message: 'Unknown unit type: ' + message.type });
        return;
      }

      if (player.gold < def.cost) {
        client.send('error', { message: 'Not enough gold' });
        return;
      }

      // Validate placement bounds (rows 1-18, cols 0-11)
      if (message.col < 0 || message.col > 11 || message.row < 1 || message.row > 18) {
        client.send('error', { message: 'Invalid placement position' });
        return;
      }

      // Check for collision with existing units
      let collision = false;
      player.units.forEach((u) => {
        if (u.col === message.col && u.row === message.row && u.alive) {
          collision = true;
        }
      });
      if (collision) {
        client.send('error', { message: 'Cell already occupied' });
        return;
      }

      // Place unit
      const unit = new UnitState();
      unit.id = `${client.sessionId}_${message.type}_${Date.now()}`;
      unit.type = message.type;
      unit.col = message.col;
      unit.row = message.row;
      unit.hp = def.hp;
      unit.maxHp = def.hp;
      unit.alive = true;

      player.units.set(unit.id, unit);
      player.gold -= def.cost;

      console.log(`[GameRoom] ${player.displayName} placed ${message.type} at (${message.col},${message.row}), gold left: ${player.gold}`);
    });

    this.onMessage('game:voteStart', (client, _message) => {
      if (this.state.phase !== 'build') return;
      this.voteStartSet.add(client.sessionId);
      console.log(`[GameRoom] ${client.sessionId} voted to start (${this.voteStartSet.size}/${this.clients.length})`);

      if (this.voteStartSet.size >= this.clients.length) {
        this.startWave();
      }
    });
  }

  onJoin(client: Client, options: Record<string, unknown>): void {
    const player = new PlayerState();
    player.uuid = (options.uuid as string) || client.sessionId;
    player.displayName = (options.displayName as string) || 'Anon';
    player.race = (options.race as string) || 'survivors';
    player.gold = 100;
    player.kingHp = 100;

    this.state.players.set(client.sessionId, player);
    console.log(`[GameRoom] ${player.displayName} joined`);

    // Start build timer when room is full
    if (this.clients.length >= 2) {
      this.startBuildTimer();
    }
  }

  onLeave(client: Client, _consented: boolean): void {
    console.log(`[GameRoom] ${client.sessionId} left`);
    // Keep player state for reconnect (Phase 1: just log)
  }

  onDispose(): void {
    if (this.buildTimerInterval) clearInterval(this.buildTimerInterval);
    console.log('[GameRoom] Disposed');
  }

  private startBuildTimer(): void {
    if (this.buildTimerInterval) return;

    this.state.phase = 'build';
    this.state.buildTimer = 30;
    this.voteStartSet.clear();

    console.log('[GameRoom] Build timer started (30s)');

    this.buildTimerInterval = setInterval(() => {
      this.state.buildTimer--;
      if (this.state.buildTimer <= 0) {
        this.startWave();
      }
    }, 1000);
  }

  private startWave(): void {
    if (this.buildTimerInterval) {
      clearInterval(this.buildTimerInterval);
      this.buildTimerInterval = null;
    }

    this.state.wave++;
    this.state.phase = 'combat';
    this.broadcast('wave:go', { wave: this.state.wave });
    console.log(`[GameRoom] Wave ${this.state.wave} started!`);

    // Phase 1: After 5s simulate wave end → income phase → new build
    setTimeout(() => {
      this.state.phase = 'income';
      // Give each player some gold
      this.state.players.forEach((p) => {
        p.gold += 20 + this.state.wave * 5;
      });

      setTimeout(() => {
        this.startBuildTimer();
      }, 3000);
    }, 5000);
  }
}
