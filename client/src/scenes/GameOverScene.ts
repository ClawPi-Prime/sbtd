import Phaser from 'phaser';

interface GameOverSceneData {
  won: boolean;
  displayName?: string;
}

export class GameOverScene extends Phaser.Scene {
  constructor() {
    super({ key: 'GameOverScene' });
  }

  init(_data: GameOverSceneData): void {
    // data available if needed
  }

  create(data: GameOverSceneData): void {
    const { width, height } = this.scale;

    this.add.rectangle(width / 2, height / 2, width, height, 0x0a0a14);

    const resultColor = data.won ? '#00ff88' : '#ff4444';
    const resultText = data.won ? 'VICTORY!' : 'DEFEAT';

    this.add.text(width / 2, height * 0.35, resultText, {
      fontFamily: 'monospace',
      fontSize: '64px',
      color: resultColor,
      stroke: '#000000',
      strokeThickness: 6,
      shadow: { blur: 30, color: resultColor, fill: true },
    }).setOrigin(0.5);

    if (data.displayName) {
      this.add.text(width / 2, height * 0.50, data.displayName, {
        fontFamily: 'monospace',
        fontSize: '22px',
        color: '#aaddff',
      }).setOrigin(0.5);
    }

    // Play Again button
    const btn = this.add.rectangle(width / 2, height * 0.65, 200, 52, 0x114422)
      .setInteractive({ useHandCursor: true });
    const btnText = this.add.text(width / 2, height * 0.65, 'PLAY AGAIN', {
      fontFamily: 'monospace',
      fontSize: '22px',
      color: '#44ff88',
    }).setOrigin(0.5);

    btn.on('pointerover', () => btn.setFillStyle(0x226633));
    btn.on('pointerout', () => btn.setFillStyle(0x114422));
    btn.on('pointerup', () => {
      this.scene.start('MainMenuScene');
    });

    // Auto-return after 30s
    let countdown = 30;
    const autoText = this.add.text(width / 2, height * 0.78, `Auto-returning in ${countdown}s`, {
      fontFamily: 'monospace',
      fontSize: '13px',
      color: '#446677',
    }).setOrigin(0.5);

    this.time.addEvent({
      delay: 1000,
      repeat: 29,
      callback: () => {
        countdown--;
        autoText.setText(`Auto-returning in ${countdown}s`);
        if (countdown <= 0) this.scene.start('MainMenuScene');
      },
    });
  }
}
