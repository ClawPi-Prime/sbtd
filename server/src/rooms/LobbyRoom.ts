import { Room, Client } from 'colyseus';
import { LobbyState } from '../schemas/LobbyState';
import { PlayerState } from '../schemas/PlayerState';

export class LobbyRoom extends Room<LobbyState> {
  maxClients = 2;
  private countdownInterval: ReturnType<typeof setInterval> | null = null;

  onCreate(_options: Record<string, unknown>): void {
    this.setState(new LobbyState());
    console.log('[LobbyRoom] Created');

    this.onMessage('lobby:setRace', (client, message: { race: string }) => {
      const player = this.state.players.get(client.sessionId);
      if (player) {
        player.race = message.race;
        console.log(`[LobbyRoom] ${client.sessionId} set race: ${message.race}`);
      }
    });

    this.onMessage('lobby:ready', (client, _message) => {
      const player = this.state.players.get(client.sessionId);
      if (player) {
        player.ready = !player.ready;
        console.log(`[LobbyRoom] ${client.sessionId} ready=${player.ready}`);
        // Cancel countdown if someone unreadied
        if (!player.ready && this.countdownInterval) {
          clearInterval(this.countdownInterval);
          this.countdownInterval = null;
          this.state.countdown = 0;
        }
        if (player.ready) this.checkAllReady();
      }
    });
  }

  onJoin(client: Client, options: Record<string, unknown>): void {
    const player = new PlayerState();
    player.uuid = (options.uuid as string) || client.sessionId;
    player.displayName = (options.displayName as string) || 'Anon';
    player.race = (options.race as string) || 'survivors';
    player.ready = false;

    this.state.players.set(client.sessionId, player);
    console.log(`[LobbyRoom] ${player.displayName} (${client.sessionId}) joined`);
  }

  onLeave(client: Client, _consented: boolean): void {
    this.state.players.delete(client.sessionId);
    console.log(`[LobbyRoom] ${client.sessionId} left`);
    if (this.countdownInterval) {
      clearInterval(this.countdownInterval);
      this.countdownInterval = null;
      this.state.countdown = 0;
    }
  }

  onDispose(): void {
    if (this.countdownInterval) clearInterval(this.countdownInterval);
    console.log('[LobbyRoom] Disposed');
  }

  private checkAllReady(): void {
    if (this.clients.length < 2) return;

    let allReady = true;
    this.state.players.forEach((p) => {
      if (!p.ready) allReady = false;
    });

    if (allReady && !this.countdownInterval) {
      this.state.countdown = 10;
      console.log('[LobbyRoom] All ready — starting 10s countdown');

      this.countdownInterval = setInterval(() => {
        this.state.countdown--;
        if (this.state.countdown <= 0) {
          clearInterval(this.countdownInterval!);
          this.countdownInterval = null;
          this.state.gameStarted = true;
          this.broadcast('game:start', {});
          console.log('[LobbyRoom] Game starting!');
        }
      }, 1000);
    }
  }
}
