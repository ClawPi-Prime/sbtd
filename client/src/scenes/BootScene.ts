import Phaser from 'phaser';

export class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: 'BootScene' });
  }

  preload(): void {
    // Create placeholder graphics programmatically — no external assets needed
    // Generate colored squares for unit types
    const unitColors: Record<string, number> = {
      scavenger: 0xa8d8a8,
      scout: 0x88b8e8,
      field_medic: 0xf8f8a8,
      camp_raider: 0xe88858,
      berserker: 0xe85858,
      camp_elder: 0xd8a8f8,
      killdozer: 0xc8a868,
      ied_mortar: 0x989868,
      sawboy: 0xc8c8c8,
      clapper: 0x889898,
      screwdriver: 0xb8d8e8,
      boomba: 0xe8c858,
      nano_cloud: 0xa8e8f8,
      metal_onion: 0x788878,
      acid_spider: 0xa8e858,
      tesla_coil: 0xd8d8f8,
    };

    // We'll generate textures in create() using Graphics
    (this as unknown as Record<string, unknown>)._unitColors = unitColors;
  }

  create(): void {
    const unitColors = (this as unknown as Record<string, unknown>)._unitColors as Record<string, number>;

    // Generate 32x32 colored square textures for each unit type
    Object.entries(unitColors).forEach(([key, color]) => {
      const g = this.add.graphics();
      g.fillStyle(color, 1.0);
      g.fillRect(2, 2, 28, 28);
      g.lineStyle(1, 0x000000, 0.5);
      g.strokeRect(2, 2, 28, 28);
      g.generateTexture(`unit_${key}`, 32, 32);
      g.destroy();
    });

    // Generate arrow texture for lane indicators
    const arrow = this.add.graphics();
    arrow.fillStyle(0xffffff, 0.5);
    arrow.fillTriangle(8, 0, 16, 16, 0, 16);
    arrow.generateTexture('lane_arrow', 16, 16);
    arrow.destroy();

    this.scene.start('MainMenuScene');
  }
}
