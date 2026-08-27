/*
 * constraints/xsums.js
 *
 * X-Sums: an outside clue on a row or column reads as
 *
 *     "the first digit in the direction of the clue is X;
 *      the first X digits (including that first one) sum to the clue value."
 *
 * State model:
 *   p.xsum = { top:Uint8Array(N), bottom:Uint8Array(N),
 *              left:Uint8Array(N), right:Uint8Array(N) }
 * A value of 0 means "no clue".
 *
 * Since a clue can only be checked once the first X cells are filled, we
 * enforce it in findConflicts on completed prefixes AND in the solver's
 * hot path via a per-side line lookup.
 */
(function () {
  function makeSides(N) {
    return {
      top: new Uint8Array(N), bottom: new Uint8Array(N),
      left: new Uint8Array(N), right: new Uint8Array(N),
    };
  }

  /* Cells for one line in reading-order from the outer clue. Returns an
     array of N cell indices. */
  function lineCells(side, idx, N) {
    const out = new Array(N);
    if (side === 'top')         { for (let r = 0; r < N; r++) out[r] = r * N + idx; }
    else if (side === 'bottom') { for (let r = 0; r < N; r++) out[r] = (N - 1 - r) * N + idx; }
    else if (side === 'left')   { for (let c = 0; c < N; c++) out[c] = idx * N + c; }
    else                        { for (let c = 0; c < N; c++) out[c] = idx * N + (N - 1 - c); }
    return out;
  }

  self.XSumsHelpers = { lineCells };

  self.SudokuConstraints.register({
    id: 'xsums',

    newFields(p)      { p.xsum = makeSides(p.N); },
    serialize(p)      {
      const x = p.xsum || makeSides(p.N);
      return { xsum: {
        top:[...x.top], bottom:[...x.bottom], left:[...x.left], right:[...x.right],
      }};
    },
    deserialize(p, j) {
      p.xsum = makeSides(p.N);
      if (j.xsum) {
        p.xsum.top.set(j.xsum.top || []);       p.xsum.bottom.set(j.xsum.bottom || []);
        p.xsum.left.set(j.xsum.left || []);     p.xsum.right.set(j.xsum.right || []);
      }
    },

    findConflicts(p, ctx) {
      const N = p.N, values = p.values;
      const clues = p.xsum || makeSides(N);
      for (const side of ['top','bottom','left','right']) {
        const arr = clues[side];
        for (let idx = 0; idx < N; idx++) {
          const clue = arr[idx]; if (!clue) continue;
          const cells = lineCells(side, idx, N);
          const first = values[cells[0]];
          if (!first) continue;   /* can't check yet */
          const X = first;
          if (X > N) { ctx.conflicts.add(cells[0]); continue; }
          /* Need first X cells filled to sum-check. */
          let sum = 0, ok = true;
          for (let k = 0; k < X; k++) {
            const v = values[cells[k]];
            if (!v) { ok = false; break; }
            sum += v;
          }
          if (!ok) continue;
          if (sum !== clue) {
            for (let k = 0; k < X; k++) ctx.conflicts.add(cells[k]);
          }
        }
      }
    },

    solverInit(p, ctx) {
      const N = ctx.N;
      const clues = p.xsum || makeSides(N);
      /* Pack every clued line into: { cells:[N], clue }. */
      const lines = [];
      for (const side of ['top','bottom','left','right']) {
        for (let idx = 0; idx < N; idx++) {
          if (!clues[side][idx]) continue;
          lines.push({ cells: lineCells(side, idx, N), clue: clues[side][idx] });
        }
      }
      if (!lines.length) return null;
      /* Per cell: list of (lineIdx, pos). */
      const lookup = Array.from({ length: N * N }, () => []);
      lines.forEach((L, li) => L.cells.forEach((c, pos) => lookup[c].push([li, pos])));
      return { lines, lookup };
    },

    solverCheck(p, ctx, h, i, v) {
      const N = ctx.N, grid = ctx.grid;
      for (const [li, pos] of h.lookup[i]) {
        const L = h.lines[li];
        const first = pos === 0 ? v : grid[L.cells[0]];
        if (!first) continue;   /* first cell empty → can't enforce */
        if (first > N) return false;
        const X = first;
        if (pos >= X) continue;   /* beyond the summed prefix */
        /* Compute current prefix sum with the proposed v at pos. */
        let sum = 0, complete = true;
        for (let k = 0; k < X; k++) {
          const cv = k === pos ? v : grid[L.cells[k]];
          if (!cv) { complete = false; break; }
          sum += cv;
          if (sum > L.clue) return false;
        }
        if (complete && sum !== L.clue) return false;
      }
      return true;
    },

    solverCommit()  {},
    solverUnplace() {},

    solverForbid(p, ctx, h, i, used) {
      const N = ctx.N, grid = ctx.grid;
      for (const [li, pos] of h.lookup[i]) {
        const L = h.lines[li];
        if (pos === 0) {
          /* first-cell value determines X. Forbid values whose implied prefix
             can never sum to the clue. */
          for (let v = 1; v <= N; v++) {
            const X = v;
            const minPrefix = v + (X - 1) * 1;    /* smallest possible */
            const maxPrefix = v + (X - 1) * N;    /* largest possible */
            if (L.clue < minPrefix || L.clue > maxPrefix) used |= ctx.bit(v);
          }
        } else {
          const first = grid[L.cells[0]];
          if (!first) continue;
          const X = first;
          if (pos >= X) continue;
          /* Track existing sum of the prefix (except this cell). */
          let sum = 0, filled = 0;
          for (let k = 0; k < X; k++) {
            if (k === pos) continue;
            const cv = grid[L.cells[k]];
            if (cv) { sum += cv; filled++; }
          }
          const missing = X - 1 - filled;   /* other still-empty cells */
          /* v must satisfy: sum + v + (missing cells worth of 1..N) = clue. */
          for (let v = 1; v <= N; v++) {
            const rest = L.clue - sum - v;
            if (rest < missing * 1 || rest > missing * N) used |= ctx.bit(v);
          }
        }
      }
      return used;
    },
  });
})();
