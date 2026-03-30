import { Schema, type } from '@colyseus/schema';

export class UnitState extends Schema {
  @type('string') id: string = '';
  @type('string') type: string = '';
  @type('int8') col: number = 0;
  @type('int8') row: number = 0;
  @type('float32') x: number = 0;
  @type('float32') y: number = 0;
  @type('int32') hp: number = 0;
  @type('int32') maxHp: number = 0;
  @type('boolean') alive: boolean = true;
  @type('string') attackType: string = 'normal';
  @type('string') armorType: string = 'unarmored';

  // Internal only — not synced to client (no @type decorator)
  attackCooldown: number = 0;
  healCooldown: number = 0;
  moveSpeed: number = 0;
  atkSpeed: number = 0;
  dmg: number = 0;
  range: number = 0;
}
