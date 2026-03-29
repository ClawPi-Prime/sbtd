import type { AttackType, ArmorType, SpecialAbility } from '../../../shared/src/index';

export interface EnemySpawnDef {
  id: string;
  type: string;
  hp: number;
  maxHp: number;
  dmg: number;
  atkSpeed: number;
  range: number;
  moveSpeed: number;
  armorType: ArmorType;
  attackType: AttackType;
  special?: SpecialAbility;
  splashRadius?: number;
  splashDmgRatio?: number;
}

let spawnCounter = 0;

function makeEnemy(type: string, overrides: Partial<EnemySpawnDef>): EnemySpawnDef {
  const id = `enemy_${type}_${++spawnCounter}_${Date.now()}`;
  const hp = overrides.hp ?? 60;
  return {
    id,
    type,
    hp,
    maxHp: hp,
    dmg: overrides.dmg ?? 5,
    atkSpeed: overrides.atkSpeed ?? 0.8,
    range: overrides.range ?? 1,
    moveSpeed: overrides.moveSpeed ?? 1.5,
    armorType: overrides.armorType ?? 'light',
    attackType: overrides.attackType ?? 'normal',
    special: overrides.special,
    splashRadius: overrides.splashRadius,
    splashDmgRatio: overrides.splashDmgRatio,
  };
}

function makeGrunts(count: number): EnemySpawnDef[] {
  const result: EnemySpawnDef[] = [];
  for (let i = 0; i < count; i++) {
    result.push(makeEnemy('grunt', {
      hp: 60, dmg: 5, atkSpeed: 0.8, range: 1, moveSpeed: 1.5,
      armorType: 'light', attackType: 'normal',
    }));
  }
  return result;
}

function makeBrutes(count: number): EnemySpawnDef[] {
  const result: EnemySpawnDef[] = [];
  for (let i = 0; i < count; i++) {
    result.push(makeEnemy('brute', {
      hp: 150, dmg: 8, atkSpeed: 0.6, range: 1, moveSpeed: 1.0,
      armorType: 'heavy', attackType: 'normal',
    }));
  }
  return result;
}

function makeSiegeMechs(count: number): EnemySpawnDef[] {
  const result: EnemySpawnDef[] = [];
  for (let i = 0; i < count; i++) {
    result.push(makeEnemy('siege_mech', {
      hp: 80, dmg: 25, atkSpeed: 0.3, range: 5, moveSpeed: 0.8,
      armorType: 'medium', attackType: 'siege',
      special: 'splash', splashRadius: 2.0, splashDmgRatio: 0.5,
    }));
  }
  return result;
}

function makeBoss(wave: number): EnemySpawnDef {
  return makeEnemy('boss', {
    hp: 600 + wave * 100, dmg: 20, atkSpeed: 0.5, range: 1, moveSpeed: 0.7,
    armorType: 'heavy', attackType: 'chaos',
  });
}

export function getWaveEnemies(wave: number): EnemySpawnDef[] {
  const enemies: EnemySpawnDef[] = [];
  const scale = Math.max(0, wave - 1) * 2; // +2 per wave beyond wave 1

  if (wave === 1) {
    enemies.push(...makeGrunts(8));
  } else if (wave === 2) {
    enemies.push(...makeGrunts(10 + scale));
    enemies.push(...makeBrutes(2));
  } else if (wave === 3) {
    enemies.push(...makeGrunts(12 + scale));
    enemies.push(...makeBrutes(3));
    enemies.push(...makeSiegeMechs(1));
  } else {
    // Wave 4+: scale up
    const gruntCount = 12 + scale;
    const bruteCount = 3 + (wave - 3) * 2;
    const siegeCount = 1 + Math.floor((wave - 3) / 2);

    enemies.push(...makeGrunts(gruntCount));
    enemies.push(...makeBrutes(bruteCount));
    enemies.push(...makeSiegeMechs(siegeCount));

    // Boss every 3 waves
    if (wave % 3 === 0) {
      enemies.push(makeBoss(wave));
    }
  }

  return enemies;
}
