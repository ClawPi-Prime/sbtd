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

  private playerListText!: Phaser.GameObjects.Text;
  private countdownText!: Phaser.GameObjects.Text;
  private statusText!: Phaser.GameObjects.Text;
  private raceCards: Phaser.GameObjects.Rectangle[] = [];
  private raceLabels: Phaser.GameObjects.Text[] = [];

  constructor() {
    super({ key: 'LobbyScene' });
  }

  init(data: LobbySceneData): void {
    this.uuid = data.uuid;
    this.displayName = data.displayName;
    this.raceCards = [];
    this.raceLabels = [];
    this.isReady = false;
  }

  create(): void {
    // ── Background ──────────────────────────────────────────────────────────
    this.add.rectangle(640, 360, 1280, 720, 0x0d0d1a);

    const grid = this.add.graphics();
    grid.lineStyle(1, 0x1a2a4a, 0.25);
    for (let x = 0; x < 1280; x += 40) grid.lineBetween(x, 0, x, 720);
    for (let y = 0; y < 720; y += 40) grid.lineBetween(0, y, 1280, y);

    // ── Title ────────────────────────────────────────────────────────────────
    this.add.text(640, 44, 'LOBBY', {
      fontFamily: 'monospace', fontSize: '38px', color: '#00d4ff',
      stroke: '#003344', strokeThickness: 4,
    }).setOrigin(0.5);

    // ── Left panel: players ───────────────────────────────────────────────
    this.add.rectangle(320, 320, 540, 400, 0x0f1120).setOrigin(0.5);
    this.add.rectangle(320, 320, 540, 400, 0x1a2a4a, 0).setStrokeStyle(1, 0x1a3a5a);

    this.add.text(80, 136, 'Players', {
      fontFamily: 'monospace', fontSize: '18px', color: '#668899',
    });

    this.playerListText = this.add.text(80, 168, 'Waiting for players...', {
      fontFamily: 'monospace', fontSize: '16px', color: '#aaddff',
      lineSpacing: 10,
    });

    this.countdownText = this.add.text(320, 430, '', {
      fontFamily: 'monospace', fontSize: '36px', color: '#ffdd00',
    }).setOrigin(0.5);

    this.statusText = this.add.text(320, 490, 'Connecting...', {
      fontFamily: 'monospace', fontSize: '14px', color: '#556677',
    }).setOrigin(0.5);

    // ── Right panel: race selector ────────────────────────────────────────
    this.add.text(710, 90, 'Choose Your Race', {
      fontFamily: 'monospace', fontSize: '20px', color: '#aabbcc',
    });

    this.buildRaceCards();

    // ── Ready button ─────────────────────────────────────────────────────
    const readyBg = this.add.rectangle(320, 570, 220, 52, 0x1a3a1a)
      .setInteractive({ useHandCursor: true })
      .setStrokeStyle(1, 0x33aa33);
    const readyText = this.add.text(320, 570, 'READY', {
      fontFamily: 'monospace', fontSize: '24px', color: '#44ff88',
    }).setOrigin(0.5);

    readyBg.on('pointerover', () => readyBg.setFillStyle(0x224422));
    readyBg.on('pointerout', () => { if (!this.isReady) readyBg.setFillStyle(0x1a3a1a); });
    readyBg.on('pointerup', () => {
      if (this.isReady || !this.room) return;
      this.isReady = true;
      readyBg.setFillStyle(0x113311);
      readyBg.setStrokeStyle(1, 0x228822);
      readyText.setText('READY ✓');
      this.room.send('lobby:ready', {});
    });

    // ── Back button ───────────────────────────────────────────────────────
    const backBtn = this.add.text(56, 692, '← Back', {
      fontFamily: 'monospace', fontSize: '14px', color: '#446688',
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    backBtn.on('pointerover', () => backBtn.setColor('#6688aa'));
    backBtn.on('pointerout', () => backBtn.setColor('#446688'));
    backBtn.on('pointerup', () => {
      if (this.room) this.room.leave();
      this.scene.start('MainMenuScene');
    });

    this.connectToLobby();
  }

  private buildRaceCards(): void {
    // Destroy old cards
    this.raceCards.forEach(c => c.destroy());
    this.raceLabels.forEach(l => l.destroy());
    this.raceCards = [];
    this.raceLabels = [];

    RACES.forEach((race, i) => {
      const cx = 960;
      const cy = 200 + i * 220;
      const isSelected = race.id === this.selectedRace;

      const bg = this.add.rectangle(cx, cy, 540, 200, isSelected ? 0x142244 : 0x0f1120)
        .setInteractive({ useHandCursor: true })
        .setStrokeStyle(2, isSelected ? 0x3388cc : 0x1a2a4a);
      this.raceCards.push(bg);

      // Race name
      const nameLabel = this.add.text(cx - 258, cy - 82, race.name, {
        fontFamily: 'monospace', fontSize: '17px',
        color: isSelected ? '#00d4ff' : '#7799aa',
      });
      this.raceLabels.push(nameLabel);

      // Unit list (2 columns)
      const unitKeys = Object.keys(race.units);
      unitKeys.forEach((key, j) => {
        const def = (race.units as Record<string, { label: string; cost: number }>)[key];
        const col = j < 4 ? 0 : 1;
        const row = j % 4;
        const lx = cx - 258 + col * 272;
        const ly = cy - 58 + row * 22;
        const txt = this.add.text(lx, ly, `• ${def.label}  ${def.cost}g`, {
          fontFamily: 'monospace', fontSize: '12px',
          color: isSelected ? '#7799bb' : '#445566',
        });
        this.raceLabels.push(txt);
      });

      bg.on('pointerup', () => {
        this.selectedRace = race.id;
        if (this.room) this.room.send('lobby:setRace', { race: race.id });
        this.buildRaceCards(); // refresh selection visuals
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

      this.statusText.setText('Connected — waiting for opponent');

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

      this.room.state.players.onRemove((_player: unknown) => {
        this.updatePlayerList();
      });

      this.room.state.listen('countdown', (value: number) => {
        this.countdownText.setText(value > 0 ? `Starting in ${value}s` : '');
      });

      this.room.onMessage('game:start', () => {
        this.scene.start('GameScene', {
          uuid: this.uuid,
          displayName: this.displayName,
          race: this.selectedRace,
          sessionId: this.room.sessionId,
        });
      });

      this.room.onLeave(() => {
        this.statusText.setText('Disconnected');
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
      const mark = p.ready ? ' ✓' : ' …';
      lines.push(`${p.displayName}  [${p.race}]${mark}`);
    });

    this.playerListText.setText(lines.join('\n') || 'Waiting for players...');
    const count = lines.length;
    this.statusText.setText(
      count < 2
        ? `Waiting for opponent... (${count}/2)`
        : 'Both players connected — press READY!'
    );
  }
}
