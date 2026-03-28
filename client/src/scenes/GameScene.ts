import Phaser from 'phaser';
import { Client, Room } from 'colyseus.js';
import mapAlpha from '../config/maps/map-alpha.json';
import survivorsConfig from '../config/races/survivors.json';
import mechanicumConfig from '../config/races/mechanicum.json';
import type { MapConfig, UnitDefinition, RaceConfig } from '@sbtd/shared';

const MAP = mapAlpha as MapConfig;
const CELL = 26;        // cell size in pixels
const MAP_OFFSET_X_LEFT = 20;
const MAP_OFFSET_X_RIGHT = 380;
const MAP_OFFSET_Y = 30;

const RACE_CONFIGS: Record<string, RaceConfig> = {
  survivors: survivorsConfig as unknown as RaceConfig,
  mechanicum: mechanicumConfig as unknown as RaceConfig,
};

interface GameSceneData {
  uuid: string;
  displayName: string;
  race: string;
  sessionId?: string;
}

interface UnitSnap {
  type: string;
  col: number;
  row: number;
  hp: number;
  maxHp: number;
  alive: boolean;
}

export class GameScene extends Phaser.Scene {
  private client!: Client;
  private room!: Room;
  private uuid = '';
  private displayName = '';
  private race = 'survivors';

  // State mirrors
  private myGold = 100;
  private myKingHp = 100;
  private wave = 0;
  private phase = 'build';
  private buildTimer = 30;

  private selectedUnitType = '';

  // Unit display objects
  private myUnitObjects: Map<string, Phaser.GameObjects.Container> = new Map();
  private oppUnitObjects: Map<string, Phaser.GameObjects.Container> = new Map();

  // HUD elements
  private goldText!: Phaser.GameObjects.Text;
  private waveText!: Phaser.GameObjects.Text;
  private phaseText!: Phaser.GameObjects.Text;
  private timerText!: Phaser.GameObjects.Text;
  private unitBar!: Phaser.GameObjects.Container;
  private statusText!: Phaser.GameObjects.Text;

  constructor() {
    super({ key: 'GameScene' });
  }

  init(data: GameSceneData): void {
    this.uuid = data.uuid;
    this.displayName = data.displayName;
    this.race = data.race || 'survivors';
  }

  create(): void {
    const { width, height } = this.scale;

    this.add.rectangle(width / 2, height / 2, width, height, 0x0a0a14);

    // Labels
    this.add.text(MAP_OFFSET_X_LEFT + (MAP.cols * CELL) / 2, MAP_OFFSET_Y - 14, 'YOUR GRID', {
      fontFamily: 'monospace', fontSize: '12px', color: '#44aaff',
    }).setOrigin(0.5, 1);

    this.add.text(MAP_OFFSET_X_RIGHT + (MAP.cols * CELL) / 2, MAP_OFFSET_Y - 14, 'OPPONENT', {
      fontFamily: 'monospace', fontSize: '12px', color: '#ff6644',
    }).setOrigin(0.5, 1);

    // Draw both grids
    this.drawGrid(MAP_OFFSET_X_LEFT, MAP_OFFSET_Y, true);
    this.drawGrid(MAP_OFFSET_X_RIGHT, MAP_OFFSET_Y, false);

    // HUD
    this.buildHUD(width, height);

    // Connect
    this.connectToGame();
  }

  private drawGrid(ox: number, oy: number, interactive: boolean): void {
    const g = this.add.graphics();

    // Background
    g.fillStyle(0x111122, 1);
    g.fillRect(ox, oy, MAP.cols * CELL, MAP.rows * CELL);

    // Spawn row highlight (top)
    g.fillStyle(0xff2200, 0.15);
    g.fillRect(ox, oy + MAP.spawnRow * CELL, MAP.cols * CELL, CELL);

    // Exit row highlight (bottom)
    g.fillStyle(0xaa00ff, 0.15);
    g.fillRect(ox, oy + MAP.exitRow * CELL, MAP.cols * CELL, CELL);

    // Build zone highlight
    g.fillStyle(0x002244, 0.3);
    g.fillRect(
      ox,
      oy + MAP.buildRows.start * CELL,
      MAP.cols * CELL,
      (MAP.buildRows.end - MAP.buildRows.start + 1) * CELL,
    );

    // Grid lines
    g.lineStyle(1, 0x223344, 0.6);
    for (let col = 0; col <= MAP.cols; col++) {
      g.lineBetween(ox + col * CELL, oy, ox + col * CELL, oy + MAP.rows * CELL);
    }
    for (let row = 0; row <= MAP.rows; row++) {
      g.lineBetween(ox, oy + row * CELL, ox + MAP.cols * CELL, oy + row * CELL);
    }

    // Border
    g.lineStyle(2, 0x334466, 1.0);
    g.strokeRect(ox, oy, MAP.cols * CELL, MAP.rows * CELL);

    // Lane indicators (small arrows)
    MAP.lanes.forEach((lane: { id: string; col: number }) => {
      const lx = ox + lane.col * CELL + CELL / 2;
      // Draw arrow markers every few rows
      for (let r = 2; r < MAP.rows - 2; r += 3) {
        const ly = oy + r * CELL + CELL / 2;
        g.fillStyle(0xffffff, 0.15);
        g.fillTriangle(lx, ly - 5, lx + 5, ly + 5, lx - 5, ly + 5);
      }
      // Lane column highlight
      g.fillStyle(0xffffff, 0.05);
      g.fillRect(ox + lane.col * CELL, oy, CELL, MAP.rows * CELL);
    });

    // Interactive click zone for my grid
    if (interactive) {
      const hitZone = this.add.rectangle(
        ox + (MAP.cols * CELL) / 2,
        oy + (MAP.rows * CELL) / 2,
        MAP.cols * CELL,
        MAP.rows * CELL,
        0x000000, 0,
      ).setInteractive();

      hitZone.on('pointerup', (pointer: Phaser.Input.Pointer) => {
        const col = Math.floor((pointer.x - ox) / CELL);
        const row = Math.floor((pointer.y - oy) / CELL);
        this.onGridClick(col, row);
      });
    }
  }

  private onGridClick(col: number, row: number): void {
    if (!this.selectedUnitType) {
      this.statusText.setText('Select a unit first!');
      return;
    }
    if (this.phase !== 'build') {
      this.statusText.setText('Can only place units during build phase');
      return;
    }
    if (row < MAP.buildRows.start || row > MAP.buildRows.end) {
      this.statusText.setText('Can only place in the build zone');
      return;
    }

    this.statusText.setText(`Placing ${this.selectedUnitType} at (${col},${row})...`);
    this.room?.send('game:placeUnit', {
      type: this.selectedUnitType,
      col,
      row,
    });
  }

  private buildHUD(width: number, _height: number): void {
    const hudY = MAP_OFFSET_Y + MAP.rows * CELL + 8;

    // Gold
    this.goldText = this.add.text(MAP_OFFSET_X_LEFT, hudY, '💰 Gold: 100', {
      fontFamily: 'monospace', fontSize: '14px', color: '#ffdd00',
    });

    // Wave
    this.waveText = this.add.text(MAP_OFFSET_X_LEFT, hudY + 20, 'Wave: 0', {
      fontFamily: 'monospace', fontSize: '14px', color: '#aaddff',
    });

    // Phase + Timer
    this.phaseText = this.add.text(MAP_OFFSET_X_LEFT + 120, hudY, 'BUILD', {
      fontFamily: 'monospace', fontSize: '14px', color: '#44ff88',
    });
    this.timerText = this.add.text(MAP_OFFSET_X_LEFT + 180, hudY, '30s', {
      fontFamily: 'monospace', fontSize: '14px', color: '#ffaa44',
    });

    // Status line
    this.statusText = this.add.text(width / 2, hudY + 40, 'Connecting...', {
      fontFamily: 'monospace', fontSize: '12px', color: '#668899',
    }).setOrigin(0.5, 0);

    // Vote Start Wave button
    const voteBg = this.add.rectangle(width - 90, hudY + 10, 160, 36, 0x223322)
      .setInteractive({ useHandCursor: true });
    const voteText = this.add.text(width - 90, hudY + 10, 'Vote Start Wave', {
      fontFamily: 'monospace', fontSize: '13px', color: '#44ff88',
    }).setOrigin(0.5);

    voteBg.on('pointerover', () => voteBg.setFillStyle(0x335533));
    voteBg.on('pointerout', () => voteBg.setFillStyle(0x223322));
    voteBg.on('pointerup', () => {
      this.room?.send('game:voteStart', {});
      voteText.setText('Voted ✓');
    });

    // Unit bar
    this.unitBar = this.add.container(0, 0);
    this.buildUnitBar(hudY + 65);
  }

  private buildUnitBar(y: number): void {
    this.unitBar.removeAll(true);

    const raceConfig = RACE_CONFIGS[this.race];
    if (!raceConfig) return;

    const units = raceConfig.units as Record<string, UnitDefinition>;
    let x = MAP_OFFSET_X_LEFT;

    Object.entries(units).forEach(([key, def]) => {
      const affordable = def.cost <= this.myGold;
      const isSelected = key === this.selectedUnitType;

      const bg = this.add.rectangle(x + 35, y + 22, 68, 42,
        isSelected ? 0x224488 : (affordable ? 0x1a2233 : 0x110e1a))
        .setInteractive({ useHandCursor: true });

      const label = this.add.text(x + 35, y + 8, def.label.slice(0, 8), {
        fontFamily: 'monospace', fontSize: '9px',
        color: isSelected ? '#00d4ff' : (affordable ? '#aaaacc' : '#444455'),
      }).setOrigin(0.5, 0);

      const costText = this.add.text(x + 35, y + 30, `${def.cost}g`, {
        fontFamily: 'monospace', fontSize: '10px',
        color: affordable ? '#ffdd44' : '#553333',
      }).setOrigin(0.5, 0);

      bg.on('pointerup', () => {
        if (!affordable) return;
        this.selectedUnitType = key;
        this.buildUnitBar(y); // refresh
        this.statusText.setText(`Selected: ${def.label} (${def.cost}g) — click grid to place`);
      });

      this.unitBar.add([bg, label, costText]);
      x += 72;
    });
  }

  private placeUnitVisual(
    objects: Map<string, Phaser.GameObjects.Container>,
    unitId: string,
    unitType: string,
    col: number,
    row: number,
    hp: number,
    maxHp: number,
    ox: number,
  ): void {
    // Remove old if exists
    if (objects.has(unitId)) {
      objects.get(unitId)!.destroy();
    }

    const px = ox + col * CELL + CELL / 2;
    const py = MAP_OFFSET_Y + row * CELL + CELL / 2;

    const container = this.add.container(px, py);

    // Unit sprite (colored rect)
    const sprite = this.add.image(0, 0, `unit_${unitType}`);
    sprite.setDisplaySize(CELL - 4, CELL - 4);
    container.add(sprite);

    // HP bar background
    const hpBg = this.add.rectangle(0, CELL / 2 - 2, CELL - 4, 3, 0x330000);
    container.add(hpBg);

    // HP bar fill
    const hpRatio = maxHp > 0 ? hp / maxHp : 1;
    const hpFill = this.add.rectangle(
      -((CELL - 4) / 2) * (1 - hpRatio),
      CELL / 2 - 2,
      (CELL - 4) * hpRatio,
      3,
      0x00ff44,
    );
    container.add(hpFill);

    objects.set(unitId, container);
  }

  private removeUnitVisual(
    objects: Map<string, Phaser.GameObjects.Container>,
    unitId: string,
  ): void {
    if (objects.has(unitId)) {
      objects.get(unitId)!.destroy();
      objects.delete(unitId);
    }
  }

  private async connectToGame(): Promise<void> {
    try {
      this.client = new Client(`ws://${window.location.host}/colyseus`);
      this.room = await this.client.joinOrCreate('game_room', {
        uuid: this.uuid,
        displayName: this.displayName,
        race: this.race,
      });

      this.statusText.setText('Connected to game room');

      // Listen for my player state
      this.room.state.players.onAdd((player: {
        listen: (field: string, cb: (value: unknown) => void) => void;
        units: {
          onAdd: (cb: (unit: UnitSnap, id: string) => void) => void;
          onRemove: (cb: (unit: UnitSnap, id: string) => void) => void;
        };
      }, sessionId: string) => {
        const isMe = sessionId === this.room.sessionId;

        player.listen('gold', (value) => {
          if (isMe) {
            this.myGold = value as number;
            this.goldText.setText(`💰 Gold: ${this.myGold}`);
            this.buildUnitBar(MAP_OFFSET_Y + MAP.rows * CELL + 73);
          }
        });

        player.listen('kingHp', (value) => {
          if (isMe) this.myKingHp = value as number;
        });

        player.units.onAdd((unit: UnitSnap, unitId: string) => {
          const ox = isMe ? MAP_OFFSET_X_LEFT : MAP_OFFSET_X_RIGHT;
          const map = isMe ? this.myUnitObjects : this.oppUnitObjects;
          this.placeUnitVisual(map, unitId, unit.type, unit.col, unit.row, unit.hp, unit.maxHp, ox);
        });

        player.units.onRemove((_unit: UnitSnap, unitId: string) => {
          const map = isMe ? this.myUnitObjects : this.oppUnitObjects;
          this.removeUnitVisual(map, unitId);
        });
      });

      // Global state
      this.room.state.listen('phase', (value: unknown) => {
        this.phase = value as string;
        const phaseColors: Record<string, string> = {
          build: '#44ff88',
          combat: '#ff4444',
          income: '#ffdd00',
        };
        this.phaseText.setText((value as string).toUpperCase());
        this.phaseText.setColor(phaseColors[value as string] || '#ffffff');
      });

      this.room.state.listen('wave', (value: unknown) => {
        this.wave = value as number;
        this.waveText.setText(`Wave: ${this.wave}`);
      });

      this.room.state.listen('buildTimer', (value: unknown) => {
        this.buildTimer = value as number;
        this.timerText.setText(`${this.buildTimer}s`);
      });

      // Messages
      this.room.onMessage('wave:go', (data: { wave: number }) => {
        console.log('[GameScene] Wave started:', data.wave);
        this.statusText.setText(`⚔️ Wave ${data.wave} — COMBAT!`);
      });

      this.room.onMessage('game:over', (data: { winner: string }) => {
        const won = data.winner === this.uuid;
        this.scene.start('GameOverScene', { won, displayName: this.displayName });
      });

      this.room.onMessage('error', (data: { message: string }) => {
        this.statusText.setText(`⚠ ${data.message}`);
      });

    } catch (err) {
      console.error('[GameScene] Connection error:', err);
      this.statusText.setText('Connection failed — returning to lobby in 3s');
      this.time.delayedCall(3000, () => {
        this.scene.start('LobbyScene', { uuid: this.uuid, displayName: this.displayName });
      });
    }
  }
}
