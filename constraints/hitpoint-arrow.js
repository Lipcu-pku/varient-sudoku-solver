/*
 * constraints/hitpoint-arrow.js
 *
 * Hitpoint Arrows: a cell contains one or more arrows pointing in any of
 * the 8 compass directions (N, NE, E, SE, S, SW, W, NW). If the arrow
 * cell contains digit D, then for each arrow direction, walk downstream
 * cells at distances k=1, 2, 3, …; a cell "hits" when its value V equals
 * its distance k from the arrow cell. D equals the total of all hits
 * summed across every arrow direction on that cell.
 *
 * State model:
 *   p.hitpoints = [{ cell: idx, dirs: bitmask 0..255 }, ...]
 *   Direction bits (LSB first):
 *     0: N   [-1, 0]
 *     1: NE  [-1, 1]
 *     2: E   [ 0, 1]
 *     3: SE  [ 1, 1]
 *     4: S   [ 1, 0]
 *     5: SW  [ 1,-1]
 *     6: W   [ 0,-1]
 *     7: NW  [-1,-1]
 */
(function () {
  const DIRS = [
    [-1, 0], [-1, 1], [0, 1], [1, 1],
    [1, 0], [1, -1], [0, -1], [-1, -1],
  ];

  self.HitpointHelpers = { DIRS, pathCells };

  function pathCells(cell, dirs, rows, cols, deleted) {
    /* Returns [{ idx, dist }, ...] for every downstream cell across every
       set direction of the arrow at `cell`. Deleted cells terminate the
       ray (as if they were the grid edge). Distances start at 1. */
    const r0 = (cell / cols) | 0, c0 = cell % cols;
    const out = [];
    for (let d = 0; d < 8; d++) {
      if (!(dirs & (1 << d))) continue;
      const [dr, dc] = DIRS[d];
      let r = r0 + dr, c = c0 + dc, k = 1;
      while (r >= 0 && r < rows && c >= 0 && c < cols) {
        const idx = r * cols + c;
        if (deleted && deleted[idx]) break;
        out.push({ idx, dist: k });
        r += dr; c += dc; k++;
      }
    }
    return out;
  }

  self.SudokuConstraints.register({
    id: 'hitpoint-arrow',

    newFields(p)      { p.hitpoints = []; },
    serialize(p)      { return { hitpoints: p.hitpoints || [] }; },
    deserialize(p, j) {
      p.hitpoints = (j.hitpoints || []).map(h => ({
        cell: h.cell | 0, dirs: h.dirs | 0,
      }));
    },

    findConflicts(p, ctx) {
      const N = p.N, values = p.values;
      const nRows = p.rows != null ? p.rows : N;
      const nCols = p.cols != null ? p.cols : N;
      for (const hp of (p.hitpoints || [])) {
        if (!hp.dirs) continue;
        const path = pathCells(hp.cell, hp.dirs, nRows, nCols, p.deleted);
        const entryV = values[hp.cell];
        if (!entryV) continue;
        if (!path.every(step => values[step.idx])) continue;
        /* All downstream cells + arrow cell filled — verify the sum. */
        let sum = 0;
        for (const step of path) {
          const v = values[step.idx];
          if (v === step.dist) sum += v;
        }
        if (sum !== entryV) {
          ctx.conflicts.add(hp.cell);
          for (const step of path) ctx.conflicts.add(step.idx);
        }
      }
    },

    solverInit(p, ctx) {
      const list = p.hitpoints || [];
      if (!list.length) return null;
      const nRows = ctx.rows != null ? ctx.rows : ctx.N;
      const nCols = ctx.cols != null ? ctx.cols : ctx.N;
      const total = ctx.total != null ? ctx.total : nRows * nCols;
      const paths = list.map(hp => pathCells(hp.cell, hp.dirs, nRows, nCols, ctx.deleted));
      /* Per-cell reverse map: for each cell, which (entry, distance) tuples
         include it in their path. */
      const pathRefsOf = Array.from({ length: total }, () => []);
      paths.forEach((path, ei) => {
        for (const step of path) {
          pathRefsOf[step.idx].push({ ei, dist: step.dist });
        }
      });
      const entryOf = Array.from({ length: total }, () => []);
      list.forEach((hp, ei) => entryOf[hp.cell].push(ei));
      return {
        list,
        paths,
        pathRefsOf,
        entryOf,
        hitSum:     new Int32Array(list.length),   /* sum of hits so far */
        pathFilled: new Int32Array(list.length),   /* cells on path filled */
        pathTotal:  paths.map(p => p.length),      /* total cells on path */
      };
    },

    solverCheck(p, ctx, h, i, v) {
      const grid = ctx.grid;
      /* Every arrow entry whose path includes i: update partial sum and
         reject overshoots or completion mismatches. */
      for (const { ei, dist } of h.pathRefsOf[i]) {
        const contrib = (v === dist) ? v : 0;
        const newSum = h.hitSum[ei] + contrib;
        const newFilled = h.pathFilled[ei] + 1;
        const entry = h.list[ei].cell;
        const entryV = (entry === i) ? undefined : grid[entry];
        if (entryV) {
          if (newSum > entryV) return false;
          if (newFilled === h.pathTotal[ei] && newSum !== entryV) return false;
        }
      }
      /* If i is itself an entry cell, verify the running sum matches when
         the path is already complete; reject if it can never catch up. */
      for (const ei of h.entryOf[i]) {
        if (h.pathFilled[ei] === h.pathTotal[ei]) {
          if (h.hitSum[ei] !== v) return false;
        } else {
          if (h.hitSum[ei] > v) return false;
        }
      }
      return true;
    },

    solverCommit(p, ctx, h, i, v) {
      for (const { ei, dist } of h.pathRefsOf[i]) {
        if (v === dist) h.hitSum[ei] += v;
        h.pathFilled[ei] += 1;
      }
    },

    solverUnplace(p, ctx, h, i, v) {
      for (const { ei, dist } of h.pathRefsOf[i]) {
        if (v === dist) h.hitSum[ei] -= v;
        h.pathFilled[ei] -= 1;
      }
    },

    solverForbid(p, ctx, h, i, used) {
      const N = ctx.N, grid = ctx.grid;
      /* If i sits on a path whose entry is filled and whose remaining budget
         (entryV - hitSum) < dist, then v=dist is already impossible without
         overshooting — forbid it. */
      for (const { ei, dist } of h.pathRefsOf[i]) {
        const entry = h.list[ei].cell;
        const entryV = grid[entry];
        if (!entryV) continue;
        const remaining = entryV - h.hitSum[ei];
        if (dist > remaining) used |= ctx.bit(dist);
      }
      /* If i is itself an entry cell with all downstream filled, only the
         achieved hitSum is allowed. */
      for (const ei of h.entryOf[i]) {
        if (h.pathFilled[ei] === h.pathTotal[ei]) {
          const only = h.hitSum[ei];
          for (let vv = 1; vv <= N; vv++) if (vv !== only) used |= ctx.bit(vv);
        } else {
          const s = h.hitSum[ei];
          for (let vv = 1; vv < s; vv++) used |= ctx.bit(vv);
        }
      }
      return used;
    },
  });
})();
