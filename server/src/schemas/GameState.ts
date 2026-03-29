import { Schema, MapSchema, type } from '@colyseus/schema';
import { PlayerState } from './PlayerState';
import { UnitState } from './UnitState';

export class GameState extends Schema {
  @type({ map: PlayerState }) players = new MapSchema<PlayerState>();
  @type({ map: UnitState }) enemies = new MapSchema<UnitState>();
  @type('string') phase: string = 'build';
  @type('int32') wave: number = 0;
  @type('number') buildTimer: number = 30;
}
