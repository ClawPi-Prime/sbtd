import Phaser from 'phaser';
import { Client, Room } from 'colyseus.js';
import survivorsConfig from '../config/races/survivors.json';
import mechanicumConfig from '../config/races/mechanicum.json';

const RACES = [survivorsConfig, mechanicumConfig];

interface LobbySceneData {
  uuid: string;
  displayName: string;
}

export class LobbyScene extends Phaser.Scene {
  private client!: Client;
  private room!: Room;
  private uuid = '';
  private displayName = '';
  private selectedRace = 'survivors';
  private isReady = false;

  // UI elements
  private playerListText!: Phaser.GameObjects.Text;
  private countdownText!: Phaser.GameObjects.Text;
  private statusText!: Phaser.GameObjects.Text;

  constructor() {
    super({ key: 'LobbyScene' });
  }

  init(data: LobbySceneData): void {
    this.uuid = data.uuid;
    this.displayName = data.displayName;
  }

  create(): void {
    const { width, height } = this.scale;

    this.add.rectangle(width / 2, height / 2, width, height, 0x0d0d1a);

    this.add.text(width / 2, 36, 'LOBBY', {
      fontFamily: 'monospace', fontSize: '36px', color: '#00d4ff',
    }).setOrigin(0.5);

    // Player list panel
    this.add.rectangle(width * 0.25, height * 0.35, width * 0.42, 120, 0x111122).setOrigin(0.5);
    this.add.text(width * 0.08, height * 0.22, 'Players:', {
      fontFamily: 'monospace', fontSize: '16px', color: '#668899',
    });
    this.playerListText = this.add.text(width * 0.08, height * 0.27, 'Waiting...', {
      fontFamily: 'monospace', fontSize: '15px', color: '#aaddff',
      lineSpacing: 6,
    });

    // Countdown
    this.countdownText = this.add.text(width / 2, height * 0.52, '', {
      fontFamily: 'monospace', fontSize: '32px', color: '#ffdd00',
    }).setOrigin(0.5);

    // Status
    this.statusText = this.add.text(width / 2, height * 0.60, 'Connecting...', {
      fontFamily: 'monospace', fontSize: '16px', color: '#668899',
    }).setOrigin(0.5);

    // Race selector
    this.buildRaceSelector(width, height);

    // Ready button
    const readyBg = this.add.rectangle(width / 2, height * 0.85, 180, 48, 0x224422)
      .setInteractive({ useHandCursor: true });
    const readyText = this.add.text(width / 2, height * 0.85, 'READY', {
      fontFamily: 'monospace', fontSize: '22px', color: '#44ff88',
    }).setOrigin(0.5);

    readyBg.on('pointerup', () => {
      if (this.isReady || !this.room) return;
      this.isReady = true;
      readyBg.setFillStyle(0x115511);
      readyText.setText('READY ✓');
      this.room.send('lobby:ready', {});
    });

    // Back button
    const backBtn = this.add.text(60, height - 30, '← Back', {
      fontFamily: 'monospace', fontSize: '14px', color: '#446688',
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    backBtn.on('pointerup', () => {
      if (this.room) this.room.leave();
      this.scene.start('MainMenuScene');
    });

    this.connectToLobby();
  }

  private buildRaceSelector(width: number, height: number): void {
    this.add.text(width * 0.62, height * 0.22, 'Choose Race:', {
      fontFamily: 'monospace', fontSize: '16px', color: '#668899',
    });

    RACES.forEach((race, i) => {
      const x = width * 0.62;
      const y = height * 0.27 + i * 130;
      const isSelected = race.id === this.selectedRace;

      const bg = this.add.rectangle(x + 140, y + 55, 280, 110, isSelected ? 0x1a3355 : 0x111122)
        .setInteractive({ useHandCursor: true });

      this.add.text(x + 8, y + 4, race.name, {
        fontFamily: 'monospace', fontSize: '14px', color: isSelected ? '#00d4ff' : '#8899aa',
      });

      // Show first 4 units
      const unitKeys = Object.keys(race.units).slice(0, 4);
      unitKeys.forEach((key, j) => {
        const def = (race.units as Record<string, { label: string; cost: number }>)[key];
        this.add.text(x + 8, y + 24 + j * 18, `• ${def.label} — ${def.cost}g`, {
          fontFamily: 'monospace', fontSize: '11px', color: '#667788',
        });
      });

      bg.on('pointerup', () => {
        this.selectedRace = race.id;
        if (this.room) this.room.send('lobby:setRace', { race: race.id });
        // Rebuild selector to refresh styles
        // Simple approach: destroy and re-create (or just update color)
      });
    });
  }

  private async connectToLobby(): Promise<void> {
    try {
      this.client = new Client(`ws://${window.location.host}/colyseus`);
      this.room = await this.client.joinOrCreate('lobby', {
        uuid: this.uuid,
        displayName: this.displayName,
        race: this.selectedRace,
      });

      this.statusText.setText('Connected to lobby');

      // State listeners
      this.room.state.players.onAdd((player: {
        displayName: string;
        race: string;
        ready: boolean;
        listen: (field: string, cb: () => void) => void;
      }, _sessionId: string) => {
        player.listen('ready', () => this.updatePlayerList());
        player.listen('race', () => this.updatePlayerList());
        this.updatePlayerList();
      });

      this.room.state.players.onRemove((_player: unknown, _sessionId: string) => {
        this.updatePlayerList();
      });

      this.room.state.listen('countdown', (value: number) => {
        if (value > 0) {
          this.countdownText.setText(`Starting in ${value}s`);
        } else {
          this.countdownText.setText('');
        }
      });

      // Message: game start
      this.room.onMessage('game:start', () => {
        console.log('[LobbyScene] Game starting!');
        this.scene.start('GameScene', {
          uuid: this.uuid,
          displayName: this.displayName,
          race: this.selectedRace,
          sessionId: this.room.sessionId,
        });
      });

      this.room.onLeave(() => {
        this.statusText.setText('Disconnected from lobby');
      });

    } catch (err) {
      console.error('[LobbyScene] Connection error:', err);
      this.statusText.setText('Connection failed — is the server running?');
    }
  }

  private updatePlayerList(): void {
    if (!this.room?.state?.players) return;

    const lines: string[] = [];
    this.room.state.players.forEach((p: {
      displayName: string;
      race: string;
      ready: boolean;
    }) => {
      const readyMark = p.ready ? ' ✓' : ' …';
      lines.push(`${p.displayName} [${p.race}]${readyMark}`);
    });

    this.playerListText.setText(lines.join('\n') || 'Waiting for players...');

    const count = lines.length;
    this.statusText.setText(count < 2 ? `Waiting for opponent... (${count}/2)` : 'Both players connected!');
  }
}
