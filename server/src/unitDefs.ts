import type { AttackType, ArmorType, SpecialAbility } from '@sbtd/shared';

export interface UnitDef {
  cost: number;
  hp: number;
  dmg: number;
  atkSpeed: number;
  range: number;
  moveSpeed: number;
  attackType: AttackType;
  armorType: ArmorType;
  special?: SpecialAbility;
  healPerSecond?: number;
  splashRadius?: number;
  splashDmgRatio?: number;
  auraRange?: number;
  auraDmg?: number;
  auraArmor?: number;
  chainTargets?: number;
  immobile?: boolean;
}

export const UNIT_DEFS: Record<string, UnitDef> = {
  // ── Survivors ──
  scavenger: {
    cost: 10, hp: 60, dmg: 8, atkSpeed: 1.5, range: 1, moveSpeed: 0,
    armorType: 'unarmored', attackType: 'normal',
  },
  scout: {
    cost: 20, hp: 80, dmg: 12, atkSpeed: 1.0, range: 3, moveSpeed: 0,
    armorType: 'light', attackType: 'pierce',
  },
  field_medic: {
    cost: 25, hp: 70, dmg: 5, atkSpeed: 0.5, range: 2, moveSpeed: 0,
    armorType: 'unarmored', attackType: 'normal',
    special: 'heal', healPerSecond: 8,
  },
  camp_raider: {
    cost: 30, hp: 100, dmg: 18, atkSpeed: 1.2, range: 1.5, moveSpeed: 0,
    armorType: 'medium', attackType: 'magic',
    special: 'splash', splashRadius: 1.5, splashDmgRatio: 0.5,
  },
  berserker: {
    cost: 40, hp: 250, dmg: 15, atkSpeed: 1.0, range: 1, moveSpeed: 0,
    armorType: 'heavy', attackType: 'normal',
  },
  camp_elder: {
    cost: 35, hp: 90, dmg: 6, atkSpeed: 0.8, range: 2, moveSpeed: 0,
    armorType: 'unarmored', attackType: 'normal',
    special: 'aura', auraRange: 2.5, auraDmg: 0.2, auraArmor: 1,
  },
  killdozer: {
    cost: 55, hp: 180, dmg: 30, atkSpeed: 0.4, range: 1, moveSpeed: 0,
    armorType: 'heavy', attackType: 'siege',
  },
  ied_mortar: {
    cost: 50, hp: 70, dmg: 40, atkSpeed: 0.3, range: 5, moveSpeed: 0,
    armorType: 'light', attackType: 'siege',
    special: 'splash', splashRadius: 2.5, splashDmgRatio: 0.6,
  },

  // ── Mechanicum ──
  sawboy: {
    cost: 12, hp: 55, dmg: 10, atkSpeed: 1.5, range: 1, moveSpeed: 0,
    armorType: 'medium', attackType: 'normal',
  },
  clapper: {
    cost: 25, hp: 80, dmg: 22, atkSpeed: 0.7, range: 2, moveSpeed: 0,
    armorType: 'medium', attackType: 'normal',
  },
  screwdriver: {
    cost: 15, hp: 60, dmg: 8, atkSpeed: 2.0, range: 3, moveSpeed: 0,
    armorType: 'light', attackType: 'pierce',
  },
  boomba: {
    cost: 30, hp: 60, dmg: 80, atkSpeed: 0.0, range: 0, moveSpeed: 2.0,
    armorType: 'unarmored', attackType: 'chaos',
    special: 'suicide', splashRadius: 2.0, splashDmgRatio: 1.0,
  },
  nano_cloud: {
    cost: 40, hp: 50, dmg: 0, atkSpeed: 0, range: 0, moveSpeed: 0.5,
    armorType: 'arcane', attackType: 'normal',
    special: 'heal', healPerSecond: 12,
  },
  metal_onion: {
    cost: 45, hp: 300, dmg: 10, atkSpeed: 0.8, range: 1, moveSpeed: 0,
    armorType: 'heavy', attackType: 'normal',
  },
  acid_spider: {
    cost: 30, hp: 75, dmg: 14, atkSpeed: 1.2, range: 1.5, moveSpeed: 0,
    armorType: 'medium', attackType: 'magic',
    special: 'splash', splashRadius: 1.0, splashDmgRatio: 0.4,
  },
  tesla_coil: {
    cost: 60, hp: 60, dmg: 25, atkSpeed: 0.6, range: 4, moveSpeed: 0,
    armorType: 'arcane', attackType: 'magic',
    special: 'chain', chainTargets: 3, immobile: true,
  },
};
