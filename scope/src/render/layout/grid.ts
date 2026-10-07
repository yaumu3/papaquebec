import { overlap, type Rect } from '../../lib/datablock';

/** Cell edge in CSS px: about a data block's width, so a block spans few cells. */
const CELL = 64;
/** Keys a cell by its column and row; rows stay far below this. */
const ROW_SPAN = 1e6;

/**
 * Rectangles bucketed by the grid cells they touch, so a query visits only its neighbours
 * rather than every rectangle added.
 */
export class RectGrid {
  private readonly rects: Rect[] = [];
  private readonly cells = new Map<number, number[]>();
  /** The last query that visited each rectangle, so one spanning several cells counts once. */
  private readonly visited: number[] = [];
  private query = 0;

  add(r: Rect): void {
    const id = this.rects.push(r) - 1;
    this.visited.push(0);
    for (const key of cellsOf(r)) {
      const bucket = this.cells.get(key);
      if (bucket) bucket.push(id);
      else this.cells.set(key, [id]);
    }
  }

  /**
   * Total overlap of `r` with every rectangle added. Summed in the order they were added, so
   * the result is bit-for-bit what a scan of them all would give.
   */
  overlapWith(r: Rect): number {
    const q = ++this.query;
    const near: number[] = [];
    for (const key of cellsOf(r)) {
      for (const id of this.cells.get(key) ?? []) {
        if (this.visited[id] === q) continue;
        this.visited[id] = q;
        near.push(id);
      }
    }
    near.sort((a, b) => a - b);
    let cost = 0;
    for (const id of near) {
      const other = this.rects[id];
      if (other) cost += overlap(r, other);
    }
    return cost;
  }
}

/** Keys of the cells a rectangle touches. */
function cellsOf(r: Rect): number[] {
  const keys: number[] = [];
  const ix1 = Math.floor(r.x1 / CELL);
  const iy1 = Math.floor(r.y1 / CELL);
  for (let ix = Math.floor(r.x0 / CELL); ix <= ix1; ix++) {
    for (let iy = Math.floor(r.y0 / CELL); iy <= iy1; iy++) keys.push(ix * ROW_SPAN + iy);
  }
  return keys;
}
