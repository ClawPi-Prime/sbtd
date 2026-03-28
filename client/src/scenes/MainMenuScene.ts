import Phaser from 'phaser';

function getCookie(name: string): string | null {
  const match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'));
  return match ? decodeURIComponent(match[2]) : null;
}

function setCookie(name: string, value: string, days = 365): void {
  const expires = new Date(Date.now() + days * 864e5).toUTCString();
  document.cookie = `${name}=${encodeURIComponent(value)}; expires=${expires}; path=/`;
}

export class MainMenuScene extends Phaser.Scene {
  private playerUuid = '';
  private playerName = '';

  constructor() {
    super({ key: 'MainMenuScene' });
  }

  create(): void {
    const { width, height } = this.scale;

    // Resolve / persist player identity
    let uuid = getCookie('player_uuid');
    if (!uuid) {
      uuid = crypto.randomUUID();
      setCookie('player_uuid', uuid);
    }
    this.playerUuid = uuid;

    let name = getCookie('player_name');
    if (!name) {
      const rnd = Math.floor(Math.random() * 900) + 100;
      name = `Anon${rnd}`;
      setCookie('player_name', name);
    }
    this.playerName = name;

    // Background gradient
    this.add.rectangle(width / 2, height / 2, width, height, 0x0d0d1a);

    // Decorative grid lines
    const grid = this.add.graphics();
    grid.lineStyle(1, 0x1a2a4a, 0.3);
    for (let x = 0; x < width; x += 40) grid.lineBetween(x, 0, x, height);
    for (let y = 0; y < height; y += 40) grid.lineBetween(0, y, width, y);

    // Title
    this.add
      .text(width / 2, height * 0.22, 'SQUAD BATTLE TD', {
        fontFamily: 'monospace',
        fontSize: '52px',
        color: '#00d4ff',
        stroke: '#003344',
        strokeThickness: 6,
        shadow: { blur: 20, color: '#00aaff', fill: true },
      })
      .setOrigin(0.5);

    this.add
      .text(width / 2, height * 0.32, 'Tactical Multiplayer Tower Defense', {
        fontFamily: 'monospace',
        fontSize: '18px',
        color: '#668899',
      })
      .setOrigin(0.5);

    // Player name display
    const nameText = this.add
      .text(width / 2, height * 0.50, `Player: ${this.playerName}`, {
        fontFamily: 'monospace',
        fontSize: '20px',
        color: '#aaddff',
      })
      .setOrigin(0.5);

    // Edit name button
    const editBtn = this.add
      .text(width / 2, height * 0.56, '[Edit Name]', {
        fontFamily: 'monospace',
        fontSize: '14px',
        color: '#446688',
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });

    editBtn.on('pointerover', () => editBtn.setColor('#88aacc'));
    editBtn.on('pointerout', () => editBtn.setColor('#446688'));
    editBtn.on('pointerup', () => {
      const newName = prompt('Enter display name:', this.playerName);
      if (newName && newName.trim()) {
        this.playerName = newName.trim().slice(0, 20);
        setCookie('player_name', this.playerName);
        nameText.setText(`Player: ${this.playerName}`);
      }
    });

    // Play button
    const playBg = this.add.rectangle(width / 2, height * 0.70, 200, 56, 0x004466, 1)
      .setInteractive({ useHandCursor: true });
    const playText = this.add
      .text(width / 2, height * 0.70, 'PLAY', {
        fontFamily: 'monospace',
        fontSize: '28px',
        color: '#00ffdd',
        stroke: '#002233',
        strokeThickness: 3,
      })
      .setOrigin(0.5);

    playBg.on('pointerover', () => {
      playBg.setFillStyle(0x006688);
      playText.setScale(1.05);
    });
    playBg.on('pointerout', () => {
      playBg.setFillStyle(0x004466);
      playText.setScale(1.0);
    });
    playBg.on('pointerup', () => {
      this.scene.start('LobbyScene', { uuid: this.playerUuid, displayName: this.playerName });
    });

    // Version
    this.add
      .text(width - 12, height - 10, 'Phase 1', {
        fontFamily: 'monospace',
        fontSize: '11px',
        color: '#334455',
      })
      .setOrigin(1, 1);
  }
}
