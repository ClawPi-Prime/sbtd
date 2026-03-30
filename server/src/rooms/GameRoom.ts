import { Room, Client } from 'colyseus';
import { GameState } from '../schemas/GameState';
import { PlayerState } from '../schemas/PlayerState';
import { UnitState } from '../schemas/UnitState';
import { UNIT_DEFS } from '../unitDefs';
import { getWaveEnemies } from '../systems/WaveSpawner';
import { tickMovement } from '../systems/MovementSystem';
import { tickCombat } from '../systems/CombatSystem';

interface PlaceUnitMsg {
  type: string;
  col: number;
  row: number;
}

const MAP_CONFIG = {
  cols: 12,
  rows: 20,
  spawnRow: 0,
  exitRow: 19,
  lanes: [{ id: 'left', col: 3 }, { id: 'right', col: 8 }],
  buildRows: { start: 1, end: 18 },
};

const TICK_RATE = 20; // Hz
const TICK_MS = 1000 / TICK_RATE;

export class GameRoom extends Room<GameState> {
  maxClients = 2;
  private buildTimerInterval: ReturnType<typeof setInterval> | null = null;
  private gameLoopInterval: ReturnType<typeof setInterval> | null = null;
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

      // Validate placement bounds
      if (message.col < 0 || message.col > MAP_CONFIG.cols - 1 ||
          message.row < MAP_CONFIG.buildRows.start || message.row > MAP_CONFIG.buildRows.end) {
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
      unit.x = message.col;
      unit.y = message.row;
      unit.hp = def.hp;
      unit.maxHp = def.hp;
      unit.alive = true;
      unit.attackType = def.attackType;
      unit.armorType = def.armorType;

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
  }

  onDispose(): void {
    if (this.buildTimerInterval) clearInterval(this.buildTimerInterval);
    if (this.gameLoopInterval) clearInterval(this.gameLoopInterval);
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
    this.state.buildTimer = 0;
    this.broadcast('wave:go', { wave: this.state.wave });
    console.log(`[GameRoom] Wave ${this.state.wave} started!`);

    // Spawn enemies across all lanes
    const waveEnemies = getWaveEnemies(this.state.wave);
    const lanes = MAP_CONFIG.lanes;

    waveEnemies.forEach((def, i) => {
      const unit = new UnitState();
      unit.id = def.id;
      unit.type = def.type;
      // Distribute enemies across lanes, stagger spawn positions
      const lane = lanes[i % lanes.length];
      unit.col = lane.col;
      unit.row = MAP_CONFIG.spawnRow;
      unit.x = lane.col;
      // Stagger spawn: start negative y so enemies enter from off-screen top
      // Client rendering clamps visuals to grid area so they only appear when y >= 0
      unit.y = -(Math.floor(i / lanes.length) * 1.5);
      unit.hp = def.hp;
      unit.maxHp = def.maxHp;
      unit.alive = true;
      unit.attackType = def.attackType;
      unit.armorType = def.armorType;
      unit.moveSpeed = def.moveSpeed;
      unit.atkSpeed = def.atkSpeed;
      unit.dmg = def.dmg;
      unit.range = def.range;

      this.state.enemies.set(unit.id, unit);
    });

    // Start game loop at 20Hz
    this.gameLoopInterval = setInterval(() => {
      this.gameTick(TICK_MS / 1000);
    }, TICK_MS);
  }

  private gameTick(deltaSec: number): void {
    // 1. Movement — get leaked unit IDs
    const leaked = tickMovement(this.state, deltaSec, MAP_CONFIG.exitRow);

    // 2. Process leaks — each leaked unit deals 1 damage to a player's kingHp
    for (const enemyId of leaked) {
      const enemy = this.state.enemies.get(enemyId);
      if (!enemy) continue;

      // Deal damage to a random player (or split across players)
      const playerEntries: { sessionId: string; player: PlayerState }[] = [];
      this.state.players.forEach((p, sid) => {
        if (p.kingHp > 0) playerEntries.push({ sessionId: sid, player: p });
      });

      if (playerEntries.length > 0) {
        // Distribute leak damage round-robin
        const target = playerEntries[Math.floor(Math.random() * playerEntries.length)];
        target.player.kingHp -= 1;
      }

      // Remove leaked enemy
      this.state.enemies.delete(enemyId);
    }

    // 3. Combat
    tickCombat(this.state, deltaSec, UNIT_DEFS);

    // 4. Check if all enemies dead → end wave
    if (this.state.enemies.size === 0) {
      this.endWave();
      return;
    }

    // 5. Check if any player's kingHp <= 0 → end game
    let loser: string | null = null;
    let winner: string | null = null;
    this.state.players.forEach((p, sid) => {
      if (p.kingHp <= 0) {
        loser = sid;
      } else {
        winner = sid;
      }
    });

    if (loser) {
      // Find the winner's uuid
      let winnerUuid = '';
      if (winner) {
        const winnerPlayer = this.state.players.get(winner);
        if (winnerPlayer) winnerUuid = winnerPlayer.uuid;
      }
      this.endGame(winnerUuid);
    }
  }

  private endWave(): void {
    if (this.gameLoopInterval) {
      clearInterval(this.gameLoopInterval);
      this.gameLoopInterval = null;
    }

    this.state.phase = 'income';
    console.log(`[GameRoom] Wave ${this.state.wave} cleared!`);

    // Give each player gold
    this.state.players.forEach((p) => {
      p.gold += 20 + this.state.wave * 5;
    });

    // After 3s: start next build phase
    setTimeout(() => {
      if (this.state.phase === 'income') {
        this.startBuildTimer();
      }
    }, 3000);
  }

  private endGame(winnerUuid: string): void {
    if (this.gameLoopInterval) {
      clearInterval(this.gameLoopInterval);
      this.gameLoopInterval = null;
    }
    if (this.buildTimerInterval) {
      clearInterval(this.buildTimerInterval);
      this.buildTimerInterval = null;
    }

    this.state.phase = 'gameover';
    this.broadcast('game:over', { winner: winnerUuid });
    console.log(`[GameRoom] Game over! Winner: ${winnerUuid}`);

    // Dispose room after 5s
    setTimeout(() => {
      this.disconnect();
    }, 5000);
  }
}
