// Spatial focus navigation for the options panel, DOM-free so it can be tested.

/** Anything with a layout box; an Element satisfies this. */
export interface Positioned {
  getBoundingClientRect(): {
    left: number;
    top: number;
    width: number;
    height: number;
  };
}

export type Direction = 'ArrowUp' | 'ArrowDown' | 'ArrowLeft' | 'ArrowRight';

/** Nearest focusable from `list` in `direction`, measured by geometry; the score is the travel distance plus 2x the perpendicular offset, so moves stay in their column. */
export function findSpatialNeighbor<T extends Positioned>(
  current: Positioned,
  list: readonly T[],
  direction: Direction
): T | null {
  const cur = current.getBoundingClientRect();
  const curX = cur.left + cur.width / 2;
  const curY = cur.top + cur.height / 2;

  let best: T | null = null;
  let bestScore = Infinity;

  for (const el of list) {
    if (el === current) continue;

    const rect = el.getBoundingClientRect();
    const dx = rect.left + rect.width / 2 - curX;
    const dy = rect.top + rect.height / 2 - curY;

    let primary: number;
    let perpendicular: number;
    if (direction === 'ArrowUp') {
      primary = -dy;
      perpendicular = Math.abs(dx);
    } else if (direction === 'ArrowDown') {
      primary = dy;
      perpendicular = Math.abs(dx);
    } else if (direction === 'ArrowLeft') {
      primary = -dx;
      perpendicular = Math.abs(dy);
    } else {
      primary = dx;
      perpendicular = Math.abs(dy);
    }

    // Must be at least a pixel further along the travel axis.
    if (primary < 1) continue;

    const score = primary + perpendicular * 2;
    if (score < bestScore) {
      bestScore = score;
      best = el;
    }
  }

  return best;
}
