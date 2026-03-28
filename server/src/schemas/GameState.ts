import { Schema, MapSchema, type } from '@colyseus/schema';
import { PlayerState } from './PlayerState';

export class GameState extends Schema {
  @type({ map: PlayerState }) players = new MapSchema<PlayerState>();
  @type('string') phase: string = 'build';
  @type('int32') wave: number = 0;
  @type('number') buildTimer: number = 30;
}
