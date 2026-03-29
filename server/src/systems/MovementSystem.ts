import { GameState } from '../schemas/GameState';

export function tickMovement(state: GameState, deltaSec: number, exitRow: number): string[] {
  const leaked: string[] = [];

  state.enemies.forEach((enemy, id) => {
    if (!enemy.alive) return;
    if (enemy.moveSpeed <= 0) return;

    // Move toward exitRow (increasing y)
    enemy.y += enemy.moveSpeed * deltaSec;

    if (enemy.y >= exitRow) {
      leaked.push(id);
    }
  });

  return leaked;
}
