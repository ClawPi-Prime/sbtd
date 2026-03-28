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

export type GamePhase = 'build' | 'combat' | 'income';

export interface LaneConfig {
  id: string;
  col: number;
}

export interface MapConfig {
  id: string;
  name: string;
  cols: number;
  rows: number;
  lanes: LaneConfig[];
  spawnRow: number;
  exitRow: number;
  buildRows: { start: number; end: number };
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
  special?: string;
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
