import { Schema, type } from '@colyseus/schema';

export class UnitState extends Schema {
  @type('string') id: string = '';
  @type('string') type: string = '';
  @type('int8') col: number = 0;
  @type('int8') row: number = 0;
  @type('int32') hp: number = 0;
  @type('int32') maxHp: number = 0;
  @type('boolean') alive: boolean = true;
}
