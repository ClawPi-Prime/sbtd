export interface UnitDef {
  cost: number;
  hp: number;
}

export const UNIT_DEFS: Record<string, UnitDef> = {
  // Survivors
  scavenger:   { cost: 10, hp: 60 },
  scout:       { cost: 20, hp: 80 },
  field_medic: { cost: 25, hp: 70 },
  camp_raider: { cost: 30, hp: 100 },
  berserker:   { cost: 40, hp: 250 },
  camp_elder:  { cost: 35, hp: 90 },
  killdozer:   { cost: 55, hp: 180 },
  ied_mortar:  { cost: 50, hp: 70 },
  // Mechanicum
  sawboy:      { cost: 12, hp: 55 },
  clapper:     { cost: 25, hp: 80 },
  screwdriver: { cost: 15, hp: 60 },
  boomba:      { cost: 30, hp: 60 },
  nano_cloud:  { cost: 40, hp: 50 },
  metal_onion: { cost: 45, hp: 300 },
  acid_spider: { cost: 30, hp: 75 },
  tesla_coil:  { cost: 60, hp: 60 },
};
