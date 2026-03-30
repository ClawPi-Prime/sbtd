export type RaceId = 'survivors' | 'mechanicum';

export type UnitType =
  // Survivors
  | 'scavenger'
  | 'scout'
  | 'field_medic'
  | 'camp_raider'
  | 'berserker'
  | 'camp_elder'
  | 'killdozer'
  | 'ied_mortar'
  // Mechanicum
  | 'sawboy'
  | 'clapper'
  | 'screwdriver'
  | 'boomba'
  | 'nano_cloud'
  | 'metal_onion'
  | 'acid_spider'
  | 'tesla_coil';

export type GamePhase = 'build' | 'combat' | 'income' | 'gameover';

export type AttackType = 'normal' | 'pierce' | 'magic' | 'siege' | 'chaos';
export type ArmorType = 'light' | 'medium' | 'heavy' | 'arcane' | 'unarmored' | 'structure';
export type SpecialAbility = 'splash' | 'heal' | 'aura' | 'charge' | 'chain' | 'suicide';

export const DAMAGE_TABLE: Record<AttackType, Record<ArmorType, number>> = {
  normal: { light: 1.0, medium: 0.75, heavy: 0.5, arcane: 0.7, unarmored: 1.0, structure: 0.5 },
  pierce: { light: 1.5, medium: 0.75, heavy: 0.5, arcane: 0.5, unarmored: 1.0, structure: 0.7 },
  magic:  { light: 1.0, medium: 1.25, heavy: 1.0, arcane: 2.0, unarmored: 1.0, structure: 0.5 },
  siege:  { light: 0.5, medium: 0.5, heavy: 1.25, arcane: 0.5, unarmored: 0.75, structure: 2.0 },
  chaos:  { light: 1.0, medium: 1.0, heavy: 1.0, arcane: 1.0, unarmored: 1.0, structure: 1.0 },
};

export type CellType = 'wall' | 'spawn' | 'lane' | 'lane_closed' | 'exit';

export interface LaneConfig {
  id: string;
  colStart: number;
  colEnd: number;
  spawnCol: number;   // center column where enemies enter
}

export interface MapConfig {
  id: string;
  name: string;
  cols: number;
  rows: number;
  lanes: LaneConfig[];
  spawnRows: { start: number; end: number };
  laneRows: { start: number; end: number };
  exitRows: { start: number; end: number };
  cells: CellType[][];  // [row][col]
}

export interface UnitDefinition {
  label: string;
  cost: number;
  hp: number;
  dmg: number;
  armor: number;
  range: number;
  atkSpeed: number;
  moveSpeed: number;
  color: string;
  attackType: AttackType;
  armorType: ArmorType;
  special?: SpecialAbility;
  healPerSecond?: number;
  splashRadius?: number;
  splashDmgRatio?: number;
  auraRange?: number;
  auraArmor?: number;
  auraDmg?: number;
  chainTargets?: number;
  immobile?: boolean;
}

export interface RaceConfig {
  id: RaceId;
  name: string;
  units: Record<string, UnitDefinition>;
}

export interface PlayerStateSnapshot {
  uuid: string;
  displayName: string;
  race: string;
  ready: boolean;
  gold: number;
  kingHp: number;
  units: Record<string, UnitStateSnapshot>;
}

export interface UnitStateSnapshot {
  id: string;
  type: string;
  col: number;
  row: number;
  hp: number;
  maxHp: number;
  alive: boolean;
}

export { MAP_ALPHA } from './maps';
