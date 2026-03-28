export interface PlayerState {
  uuid: string;
  displayName: string;
}

export interface LobbyState {
  players: PlayerState[];
  countdown: number;
}
