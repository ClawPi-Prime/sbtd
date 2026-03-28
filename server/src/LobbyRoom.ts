import { Room, Client } from 'colyseus';

export class LobbyRoom extends Room {
  onCreate(options: Record<string, unknown>): void {
    console.log('[LobbyRoom] Created', options);

    this.onMessage('ping', (client, _message) => {
      client.send('pong', { time: Date.now() });
    });
  }

  onJoin(client: Client, _options: Record<string, unknown>): void {
    console.log(`[LobbyRoom] ${client.sessionId} joined`);
    client.send('welcome', {
      message: 'Welcome to SquadBattleTD!',
      sessionId: client.sessionId,
    });
  }

  onLeave(client: Client, _consented: boolean): void {
    console.log(`[LobbyRoom] ${client.sessionId} left`);
  }

  onDispose(): void {
    console.log('[LobbyRoom] Disposed');
  }
}
