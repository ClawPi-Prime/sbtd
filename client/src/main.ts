import Phaser from 'phaser';

class LoadingScene extends Phaser.Scene {
  constructor() {
    super({ key: 'LoadingScene' });
  }

  create(): void {
    const { width, height } = this.scale;

    // Background
    this.add.rectangle(width / 2, height / 2, width, height, 0x1a1a2e);

    // Title text
    this.add
      .text(width / 2, height / 2 - 40, 'SquadBattleTD', {
        fontFamily: 'Arial',
        fontSize: '48px',
        color: '#00d4ff',
        stroke: '#003344',
        strokeThickness: 4,
      })
      .setOrigin(0.5);

    // Loading text
    this.add
      .text(width / 2, height / 2 + 40, 'SquadBattleTD — Loading...', {
        fontFamily: 'Arial',
        fontSize: '24px',
        color: '#ffffff',
      })
      .setOrigin(0.5)
      .setAlpha(0.7);

    // Animated dots
    let dots = 0;
    const loadingText = this.add
      .text(width / 2, height / 2 + 80, '', {
        fontFamily: 'Arial',
        fontSize: '18px',
        color: '#888888',
      })
      .setOrigin(0.5);

    this.time.addEvent({
      delay: 500,
      loop: true,
      callback: () => {
        dots = (dots + 1) % 4;
        loadingText.setText('.'.repeat(dots));
      },
    });
  }
}

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  width: 800,
  height: 600,
  backgroundColor: '#1a1a2e',
  scene: LoadingScene,
  parent: document.body,
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
};

new Phaser.Game(config);
