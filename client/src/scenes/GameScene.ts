import Phaser from 'phaser';
import { Client, Room } from 'colyseus.js';
import survivorsConfig from '../config/races/survivors.json';
import mechanicumConfig from '../config/races/mechanicum.json';
import type { UnitDefinition, RaceConfig } from '@sbtd/shared';
import { MAP_ALPHA } from '@sbtd/shared';

const MAP = MAP_ALPHA;
// Layout: canvas 1280×720
// Grid: 14 cols × 24 rows at CELL=24 → 336×576px per grid
// Two grids side by side with gap: 30 + 336 + 28gap + 336 = 730px (fits)
// HUD below grids: 32 + 576 = 608, leaving 112px for HUD
const CELL = 24;
const MAP_OFFSET_X_LEFT = 30;
const MAP_OFFSET_X_RIGHT = 394;   // 30 + 336 + 28
const MAP_OFFSET_Y = 32;

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
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  alive: boolean;
  attackType: string;
  armorType: string;
  ownerId: string;
  listen: (field: string, cb: (value: unknown, prev: unknown) => void) => void;
}

interface EnemyVisual {
  container: Phaser.GameObjects.Container;
  hpFill: Phaser.GameObjects.Rectangle;
  hpBg: Phaser.GameObjects.Rectangle;
  serverX: number;
  serverY: number;
  maxHp: number;
  isMyLane: boolean;
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
  private enemyObjects: Map<string, EnemyVisual> = new Map();

  // HUD elements
  private goldText!: Phaser.GameObjects.Text;
  private waveText!: Phaser.GameObjects.Text;
  private phaseText!: Phaser.GameObjects.Text;
  private timerText!: Phaser.GameObjects.Text;
  private kingHpText!: Phaser.GameObjects.Text;
  private unitBar!: Phaser.GameObjects.Container;
  private unitBarY = 0;
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

  update(_time: number, _delta: number): void {
    this.enemyObjects.forEach((ev) => {
      const ox = ev.isMyLane ? MAP_OFFSET_X_LEFT : MAP_OFFSET_X_RIGHT;
      const targetPx = ox + ev.serverX * CELL + CELL / 2;
      const targetPy = MAP_OFFSET_Y + ev.serverY * CELL + CELL / 2;
      ev.container.setVisible(ev.serverY >= 0);
      ev.container.x += (targetPx - ev.container.x) * 0.3;
      ev.container.y += (targetPy - ev.container.y) * 0.3;
    });
  }

  private drawGrid(ox: number, oy: number, interactive: boolean): void {
    const g = this.add.graphics();
    const totalW = MAP.cols * CELL;  // 14*24 = 336
    const totalH = MAP.rows * CELL;  // 24*24 = 576

    const CYAN = 0x4cc8f5;
    const WHITE = 0xffffff;
    const STROKE = 3;

    // Dark charcoal background for the entire map area
    g.fillStyle(0x2a2a2a, 1.0);
    g.fillRect(ox, oy, totalW, totalH);

    // --- ENEMY SPAWN room (rows 0–2) ---
    const spawnH = 3 * CELL; // 72
    g.fillStyle(WHITE, 1.0);
    g.fillRect(ox, oy, totalW, spawnH);
    g.lineStyle(STROKE, CYAN, 1.0);
    g.strokeRect(ox, oy, totalW, spawnH);
    this.add.text(ox + totalW / 2, oy + spawnH / 2, 'ENEMY SPAWN', {
      fontFamily: 'monospace', fontSize: '14px', color: '#000000', fontStyle: 'bold',
    }).setOrigin(0.5);

    // --- Left corridor (cols 0–5, rows 3–17) ---
    const corrY = oy + 3 * CELL;     // oy + 72
    const corrH = 15 * CELL;         // 360 (rows 3–17)
    const leftCorrW = 6 * CELL;      // 144

    const leftAlpha = interactive ? 1.0 : 0.4;
    g.fillStyle(interactive ? 0xe8f4ff : WHITE, leftAlpha);
    g.fillRect(ox, corrY, leftCorrW, corrH);
    g.lineStyle(STROKE, CYAN, leftAlpha);
    g.strokeRect(ox, corrY, leftCorrW, corrH);

    if (interactive) {
      this.add.text(ox + leftCorrW / 2, corrY + corrH / 2, 'PLAYER\nLANE', {
        fontFamily: 'monospace', fontSize: '11px', color: '#000000',
        fontStyle: 'bold', align: 'center',
      }).setOrigin(0.5).setAlpha(0.35);
    }

    // --- Right corridor (cols 7–13, rows 3–17) — dimmed in 1v1 ---
    const rightCorrX = ox + 7 * CELL; // ox + 168
    const rightCorrW = 7 * CELL;      // 168

    g.fillStyle(WHITE, 0.4);
    g.fillRect(rightCorrX, corrY, rightCorrW, corrH);
    g.lineStyle(STROKE, CYAN, 0.4);
    g.strokeRect(rightCorrX, corrY, rightCorrW, corrH);

    // --- Connector lines: spawn → corridors ---
    g.lineStyle(2, CYAN, 0.6);
    g.lineBetween(ox + leftCorrW / 2, oy + spawnH, ox + leftCorrW / 2, corrY);
    g.lineBetween(rightCorrX + rightCorrW / 2, oy + spawnH, rightCorrX + rightCorrW / 2, corrY);

    // --- Junction nodes (in row-18 gap between corridors and KC) ---
    const juncY = oy + 18 * CELL + CELL / 2; // center of row 18
    const juncLeftX = ox + leftCorrW / 2;     // center of left corridor
    const juncRightX = rightCorrX + rightCorrW / 2;

    // Connector lines: corridor bottoms → junction nodes
    g.lineStyle(2, CYAN, 1.0);
    g.lineBetween(juncLeftX, corrY + corrH, juncLeftX, juncY - 18);
    g.lineStyle(2, CYAN, 0.4);
    g.lineBetween(juncRightX, corrY + corrH, juncRightX, juncY - 18);

    // Left junction node
    g.fillStyle(WHITE, 1.0);
    g.fillCircle(juncLeftX, juncY, 18);
    g.lineStyle(STROKE, CYAN, 1.0);
    g.strokeCircle(juncLeftX, juncY, 18);
    g.fillStyle(0xf5a0b0, 1.0);
    g.fillCircle(juncLeftX, juncY, 9);

    // Right junction node (dimmed)
    g.fillStyle(WHITE, 0.4);
    g.fillCircle(juncRightX, juncY, 18);
    g.lineStyle(STROKE, CYAN, 0.4);
    g.strokeCircle(juncRightX, juncY, 18);
    g.fillStyle(0xe01020, 0.4);
    g.fillCircle(juncRightX, juncY, 9);

    // --- KINGS CHAMBER (rows 19–23) ---
    const kcY = oy + 19 * CELL;  // oy + 456
    const kcH = 5 * CELL;        // 120

    // Connector lines: junction nodes → KC top
    g.lineStyle(2, CYAN, 1.0);
    g.lineBetween(juncLeftX, juncY + 18, juncLeftX, kcY);
    g.lineStyle(2, CYAN, 0.4);
    g.lineBetween(juncRightX, juncY + 18, juncRightX, kcY);

    g.fillStyle(WHITE, 1.0);
    g.fillRect(ox, kcY, totalW, kcH);
    g.lineStyle(STROKE, CYAN, 1.0);
    g.strokeRect(ox, kcY, totalW, kcH);
    this.add.text(ox + totalW / 2, kcY + kcH / 2, 'KINGS CHAMBER', {
      fontFamily: 'monospace', fontSize: '14px', color: '#000000', fontStyle: 'bold',
    }).setOrigin(0.5);

    // --- Interactive click zone for placement ---
    if (interactive) {
      const hitZone = this.add.rectangle(
        ox + totalW / 2,
        oy + totalH / 2,
        totalW,
        totalH,
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
    const cell = MAP.cells[row]?.[col];
    if (!cell || cell !== 'lane' || row < MAP.laneRows.start || row > MAP.laneRows.end) {
      this.statusText.setText('Can only place in lane corridors');
      return;
    }

    this.statusText.setText(`Placing ${this.selectedUnitType} at (${col},${row})...`);
    this.room?.send('game:placeUnit', {
      type: this.selectedUnitType,
      col,
      row,
    });
  }

  private buildHUD(width: number, height: number): void {
    // Grid bottom: MAP_OFFSET_Y + rows*CELL = 32 + 24*24 = 608
    // HUD row 1: y=614  (gold, kingHP, phase, timer, wave, vote button)
    // HUD row 2: y=634  (status text)
    // HUD row 3: y=650  (unit bar, ~66px tall → bottom at 716, within 720)
    const gridBottom = MAP_OFFSET_Y + MAP.rows * CELL; // 608
    const row1 = gridBottom + 6;   // 598
    const row2 = gridBottom + 26;  // 618
    const unitBarY = gridBottom + 44; // 636

    // Divider line
    const divider = this.add.graphics();
    divider.lineStyle(1, 0x223344, 0.8);
    divider.lineBetween(0, gridBottom + 2, width, gridBottom + 2);

    // Row 1: Gold | HP | Phase | Timer | Wave | [Vote button]
    this.goldText = this.add.text(MAP_OFFSET_X_LEFT, row1, '💰 100g', {
      fontFamily: 'monospace', fontSize: '13px', color: '#ffdd00',
    });
    this.kingHpText = this.add.text(MAP_OFFSET_X_LEFT + 80, row1, '❤️ 100', {
      fontFamily: 'monospace', fontSize: '13px', color: '#ff6666',
    });
    this.phaseText = this.add.text(MAP_OFFSET_X_LEFT + 160, row1, 'BUILD', {
      fontFamily: 'monospace', fontSize: '13px', color: '#44ff88',
    });
    this.timerText = this.add.text(MAP_OFFSET_X_LEFT + 218, row1, '30s', {
      fontFamily: 'monospace', fontSize: '13px', color: '#ffaa44',
    });
    this.waveText = this.add.text(MAP_OFFSET_X_LEFT + 264, row1, 'Wave 0', {
      fontFamily: 'monospace', fontSize: '13px', color: '#aaddff',
    });

    // Vote Start Wave button — right side
    const voteBg = this.add.rectangle(width - 84, row1 + 8, 152, 30, 0x1a2a1a)
      .setInteractive({ useHandCursor: true })
      .setStrokeStyle(1, 0x336633);
    const voteText = this.add.text(width - 84, row1 + 8, '▶ Start Wave', {
      fontFamily: 'monospace', fontSize: '12px', color: '#44ff88',
    }).setOrigin(0.5);

    voteBg.on('pointerover', () => voteBg.setFillStyle(0x224422));
    voteBg.on('pointerout', () => voteBg.setFillStyle(0x1a2a1a));
    voteBg.on('pointerup', () => {
      this.room?.send('game:voteStart', {});
      voteText.setText('Voted ✓');
      voteBg.setFillStyle(0x112211);
    });

    // Row 2: Status text
    this.statusText = this.add.text(width / 2, row2, 'Connecting...', {
      fontFamily: 'monospace', fontSize: '11px', color: '#556677',
    }).setOrigin(0.5, 0);

    // Row 3: Unit bar
    this.unitBar = this.add.container(0, 0);
    this.unitBarY = unitBarY;
    this.buildUnitBar(unitBarY);

    // Sell button placeholder (right of unit bar)
    this.add.text(width - 84, unitBarY + 20, 'Click unit\nto select', {
      fontFamily: 'monospace', fontSize: '10px', color: '#334455',
      align: 'center',
    }).setOrigin(0.5);

    void height; // used for future panels
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
    if (objects.has(unitId)) {
      objects.get(unitId)!.destroy();
    }

    const px = ox + col * CELL + CELL / 2;
    const py = MAP_OFFSET_Y + row * CELL + CELL / 2;

    const container = this.add.container(px, py);

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

  private updateUnitHpBar(container: Phaser.GameObjects.Container, hp: number, maxHp: number): void {
    // HP bar fill is the 3rd child (index 2)
    const hpFill = container.getAt(2) as Phaser.GameObjects.Rectangle;
    if (!hpFill) return;
    const hpRatio = maxHp > 0 ? Math.max(0, hp / maxHp) : 0;
    const barWidth = CELL - 4;
    hpFill.width = barWidth * hpRatio;
    hpFill.x = -(barWidth / 2) * (1 - hpRatio);
    // Color: green → yellow → red
    if (hpRatio > 0.5) hpFill.setFillStyle(0x00ff44);
    else if (hpRatio > 0.25) hpFill.setFillStyle(0xffdd00);
    else hpFill.setFillStyle(0xff2200);
  }

  private addEnemyVisual(enemyId: string, unit: UnitSnap): void {
    // Render on left grid (mine) if ownerId matches my session, else right (opponent)
    const isMyLane = unit.ownerId === this.room?.sessionId;
    const ox = isMyLane ? MAP_OFFSET_X_LEFT : MAP_OFFSET_X_RIGHT;
    const px = ox + unit.x * CELL + CELL / 2;
    const py = MAP_OFFSET_Y + unit.y * CELL + CELL / 2;

    const container = this.add.container(px, py);

    // Enemy sprite: small red rectangle
    const sprite = this.add.rectangle(0, 0, CELL - 6, CELL - 6, 0xcc2222);
    container.add(sprite);

    // HP bar bg
    const hpBg = this.add.rectangle(0, -(CELL / 2) + 1, CELL - 4, 3, 0x330000);
    container.add(hpBg);

    // HP bar fill
    const hpRatio = unit.maxHp > 0 ? unit.hp / unit.maxHp : 1;
    const hpFill = this.add.rectangle(
      -((CELL - 4) / 2) * (1 - hpRatio),
      -(CELL / 2) + 1,
      (CELL - 4) * hpRatio,
      3,
      0xff4444,
    );
    container.add(hpFill);

    this.enemyObjects.set(enemyId, {
      container,
      hpFill,
      hpBg,
      serverX: unit.x,
      serverY: unit.y,
      maxHp: unit.maxHp,
      isMyLane,
    });
  }

  private removeEnemyVisual(enemyId: string): void {
    const ev = this.enemyObjects.get(enemyId);
    if (ev) {
      ev.container.destroy();
      this.enemyObjects.delete(enemyId);
    }
  }

  private updateEnemyHp(enemyId: string, hp: number): void {
    const ev = this.enemyObjects.get(enemyId);
    if (!ev) return;
    const hpRatio = ev.maxHp > 0 ? Math.max(0, hp / ev.maxHp) : 0;
    const barWidth = CELL - 4;
    ev.hpFill.width = barWidth * hpRatio;
    ev.hpFill.x = -(barWidth / 2) * (1 - hpRatio);
    if (hpRatio > 0.5) ev.hpFill.setFillStyle(0xff4444);
    else if (hpRatio > 0.25) ev.hpFill.setFillStyle(0xffdd00);
    else ev.hpFill.setFillStyle(0xff0000);
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

      // Listen for player state
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
            this.goldText.setText(`Gold: ${this.myGold}`);
            this.buildUnitBar(this.unitBarY);
          }
        });

        player.listen('kingHp', (value) => {
          if (isMe) {
            this.myKingHp = value as number;
            this.kingHpText.setText(`HP: ${this.myKingHp}`);
          }
        });

        player.units.onAdd((unit: UnitSnap, unitId: string) => {
          const ox = isMe ? MAP_OFFSET_X_LEFT : MAP_OFFSET_X_RIGHT;
          const map = isMe ? this.myUnitObjects : this.oppUnitObjects;
          this.placeUnitVisual(map, unitId, unit.type, unit.col, unit.row, unit.hp, unit.maxHp, ox);

          // Listen for HP changes on defenders
          unit.listen('hp', (newHp: unknown) => {
            const container = map.get(unitId);
            if (container) {
              this.updateUnitHpBar(container, newHp as number, unit.maxHp);
            }
          });
        });

        player.units.onRemove((_unit: UnitSnap, unitId: string) => {
          const map = isMe ? this.myUnitObjects : this.oppUnitObjects;
          this.removeUnitVisual(map, unitId);
        });
      });

      // Listen for enemy state
      this.room.state.enemies.onAdd((enemy: UnitSnap, enemyId: string) => {
        this.addEnemyVisual(enemyId, enemy);

        // Listen for position and HP changes
        enemy.listen('x', (newX: unknown) => {
          const ev = this.enemyObjects.get(enemyId);
          if (ev) ev.serverX = newX as number;
        });

        enemy.listen('y', (newY: unknown) => {
          const ev = this.enemyObjects.get(enemyId);
          if (ev) ev.serverY = newY as number;
        });

        enemy.listen('hp', (newHp: unknown) => {
          this.updateEnemyHp(enemyId, newHp as number);
        });
      });

      this.room.state.enemies.onRemove((_enemy: UnitSnap, enemyId: string) => {
        this.removeEnemyVisual(enemyId);
      });

      // Global state
      this.room.state.listen('phase', (value: unknown) => {
        this.phase = value as string;
        const phaseColors: Record<string, string> = {
          build: '#44ff88',
          combat: '#ff4444',
          income: '#ffdd00',
          gameover: '#888888',
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
        this.statusText.setText(`Wave ${data.wave} — COMBAT!`);
      });

      this.room.onMessage('game:over', (data: { winner: string }) => {
        const won = data.winner === this.uuid;
        this.scene.start('GameOverScene', { won, displayName: this.displayName });
      });

      this.room.onMessage('error', (data: { message: string }) => {
        this.statusText.setText(`${data.message}`);
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
