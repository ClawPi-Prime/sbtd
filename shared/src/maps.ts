import type { CellType, MapConfig } from './index';

/**
 * Build the 2D cells array for the alpha map.
 *
 * Layout (14 cols × 24 rows):
 *   Rows  0–2  : SPAWN ZONE (full width)
 *   Row   3    : SPAWN-EXIT WALL (walls with openings into lanes)
 *   Rows  4–17 : LANE CORRIDORS
 *                  Col 0       — outer wall (left)
 *                  Cols 1–5    — left lane (primary, 5 wide)
 *                  Col 6       — wall divider
 *                  Cols 7–12   — right lane (secondary, 6 wide)
 *                  Col 13      — outer wall (right)
 *   Row   18   : LANE-EXIT WALL (walls with openings to King's Chamber)
 *   Rows 19–23 : KING'S CHAMBER / EXIT (enemies attack king here)
 */
function buildAlphaCells(cols: number, rows: number): CellType[][] {
  const cells: CellType[][] = [];

  for (let r = 0; r < rows; r++) {
    const row: CellType[] = [];
    for (let c = 0; c < cols; c++) {
      // Spawn zone (rows 0-2)
      if (r >= 0 && r <= 2) {
        row.push('spawn');
        continue;
      }

      // Spawn-exit wall (row 3) and lane-exit wall (row 18)
      if (r === 3 || r === 18) {
        // Openings where lanes are, walls everywhere else
        if ((c >= 1 && c <= 5) || (c >= 7 && c <= 12)) {
          row.push('lane');
        } else {
          row.push('wall');
        }
        continue;
      }

      // Lane corridors (rows 4-17)
      if (r >= 4 && r <= 17) {
        if (c === 0 || c === 6 || c === 13) {
          row.push('wall');
        } else if (c >= 1 && c <= 5) {
          row.push('lane');
        } else if (c >= 7 && c <= 12) {
          row.push('lane');  // in 1v1, second lane can be set to 'lane_closed'
        } else {
          row.push('wall');
        }
        continue;
      }

      // King's chamber / exit zone (rows 19-23)
      if (r >= 19 && r <= 23) {
        row.push('exit');
        continue;
      }

      row.push('wall');
    }
    cells.push(row);
  }

  return cells;
}

export const MAP_ALPHA: MapConfig = {
  id: 'alpha',
  name: 'The Divide',
  cols: 14,
  rows: 24,
  lanes: [
    { id: 'left', colStart: 1, colEnd: 5, spawnCol: 3 },
    { id: 'right', colStart: 7, colEnd: 12, spawnCol: 9 },
  ],
  spawnRows: { start: 0, end: 2 },
  laneRows: { start: 4, end: 17 },
  exitRows: { start: 19, end: 23 },
  cells: buildAlphaCells(14, 24),
};
