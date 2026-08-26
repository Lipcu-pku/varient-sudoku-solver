/*
 * constraints/little-killer.js
 *
 * Little Killer: a diagonal arrow placed outside the grid indicates that
 * the digits along that diagonal (starting from the adjacent inside-grid
 * cell) sum to the given target. Unlike a Killer cage, digits may repeat
 * along the diagonal — the constraint is only about the sum.
 *
 * State model:
 *   p.littleKillers = [{ side, idx, dir, sum }, ...]
 *     side: 'top' | 'bottom' | 'left' | 'right'
 *     idx:  0..N-1, position of the outer cell along that side
 *     dir:  'dr' | 'dl' | 'ur' | 'ul' (down-right, down-left, up-right, up-left)
 *     sum:  target sum for cells along the diagonal
 */
(function () {
  function diagCells(side, idx, dir, N) {
    const cells = [];
    let r, c;
    if (side === 'top')         { r = 0;     c = idx; }
    else if (side === 'bottom') { r = N - 1; c = idx; }
    else if (side === 'left')   { r = idx;   c = 0; }
    else                        { r = idx;   c = N - 1; }
    const dr = (dir === 'dr' || dir === 'dl') ? 1 : -1;
    const dc = (dir === 'dr' || dir === 'ur') ? 1 : -1;
    while (r >= 0 && r < N && c >= 0 && c < N) {
      cells.push(r * N + c);
      r += dr; c += dc;
    }
    return cells;
  }

  self.LittleKillerHelpers = { diagCells };

  self.SudokuConstraints.register({
    id: 'little-killer',

    newFields(p)      { p.littleKillers = []; },
    serialize(p)      { return { littleKillers: p.littleKillers || [] }; },
    deserialize(p, j) {
      p.littleKillers = (j.littleKillers || []).map(a => ({
        side: a.side, idx: a.idx | 0, dir: a.dir, sum: a.sum | 0,
      }));
    },

    findConflicts(p, ctx) {
      const N = p.N, values = p.values;
      for (const lk of (p.littleKillers || [])) {
        const cells = diagCells(lk.side, lk.idx, lk.dir, N);
        if (!cells.length) continue;
        if (!cells.every(i => values[i])) continue;
        let s = 0;
        for (const i of cells) s += values[i];
        if (s !== lk.sum) cells.forEach(i => ctx.conflicts.add(i));
      }
    },

    solverInit(p, ctx) {
      const list = p.littleKillers || [];
      if (!list.length) return null;
      const N = ctx.N;
      const total = N * N;
      const cellsOf = list.map(lk => diagCells(lk.side, lk.idx, lk.dir, N));
      const diagOf = Array.from({ length: total }, () => []);
      cellsOf.forEach((cells, di) => cells.forEach(cell => diagOf[cell].push(di)));
      return {
        list,
        cellsOf,
        diagOf,
        partial: new Int32Array(list.length),
        filled:  new Int32Array(list.length),
      };
    },

    solverCheck(p, ctx, h, i, v) {
      for (const di of h.diagOf[i]) {
        const target = h.list[di].sum;
        const newSum = h.partial[di] + v;
        const newFilled = h.filled[di] + 1;
        const total = h.cellsOf[di].length;
        if (newFilled === total) {
          if (newSum !== target) return false;
        } else if (newSum >= target) {
          return false;
        }
      }
      return true;
    },

    solverCommit(p, ctx, h, i, v) {
      for (const di of h.diagOf[i]) {
        h.partial[di] += v;
        h.filled[di]  += 1;
      }
    },

    solverUnplace(p, ctx, h, i, v) {
      for (const di of h.diagOf[i]) {
        h.partial[di] -= v;
        h.filled[di]  -= 1;
      }
    },

    solverForbid(p, ctx, h, i, used) {
      const N = ctx.N;
      for (const di of h.diagOf[i]) {
        const remaining = h.list[di].sum - h.partial[di];
        for (let v = 1; v <= N; v++) if (v > remaining) used |= ctx.bit(v);
      }
      return used;
    },
  });
})();
