import { Schema, MapSchema, type } from '@colyseus/schema';
import { UnitState } from './UnitState';

export class PlayerState extends Schema {
  @type('string') uuid: string = '';
  @type('string') displayName: string = '';
  @type('string') race: string = 'survivors';
  @type('boolean') ready: boolean = false;
  @type('int32') gold: number = 100;
  @type('int32') kingHp: number = 100;
  @type({ map: UnitState }) units = new MapSchema<UnitState>();
}
