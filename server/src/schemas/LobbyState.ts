import { Schema, MapSchema, type } from '@colyseus/schema';
import { PlayerState } from './PlayerState';

export class LobbyState extends Schema {
  @type({ map: PlayerState }) players = new MapSchema<PlayerState>();
  @type('number') countdown: number = 0;
  @type('boolean') gameStarted: boolean = false;
}
