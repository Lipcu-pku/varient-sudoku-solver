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
  function makeSides(rowsOrN, colsMaybe) {
    /* Legacy: makeSides(N) → all sides N-long. New: makeSides(rows, cols)
       → top/bottom sized cols, left/right sized rows. */
    let rows, cols;
    if (colsMaybe === undefined) { rows = cols = rowsOrN; }
    else                          { rows = rowsOrN; cols = colsMaybe; }
    return {
      top: new Uint8Array(cols), bottom: new Uint8Array(cols),
      left: new Uint8Array(rows), right: new Uint8Array(rows),
    };
  }

  /* Cells for one line in reading-order from the outer clue. Returns an
     array of cell indices along that line (may be shorter than the full
     row/col if deleted cells are skipped). */
  function lineCells(side, idx, rowsOrN, colsMaybe, deletedMaybe) {
    let rows, cols, deleted;
    if (colsMaybe === undefined) { rows = cols = rowsOrN; deleted = null; }
    else if (typeof colsMaybe === 'object') { rows = cols = rowsOrN; deleted = colsMaybe; }
    else { rows = rowsOrN; cols = colsMaybe; deleted = deletedMaybe || null; }
    const out = [];
    if (side === 'top') {
      for (let r = 0; r < rows; r++) { const i = r * cols + idx; if (!deleted || !deleted[i]) out.push(i); }
    } else if (side === 'bottom') {
      for (let r = 0; r < rows; r++) { const i = (rows - 1 - r) * cols + idx; if (!deleted || !deleted[i]) out.push(i); }
    } else if (side === 'left') {
      for (let c = 0; c < cols; c++) { const i = idx * cols + c; if (!deleted || !deleted[i]) out.push(i); }
    } else {
      for (let c = 0; c < cols; c++) { const i = idx * cols + (cols - 1 - c); if (!deleted || !deleted[i]) out.push(i); }
    }
    return out;
  }

  self.XSumsHelpers = { lineCells };

  self.SudokuConstraints.register({
    id: 'xsums',

    newFields(p) {
      const nRows = p.rows != null ? p.rows : p.N;
      const nCols = p.cols != null ? p.cols : p.N;
      p.xsum = makeSides(nRows, nCols);
    },
    serialize(p)      {
      const nRows = p.rows != null ? p.rows : p.N;
      const nCols = p.cols != null ? p.cols : p.N;
      const x = p.xsum || makeSides(nRows, nCols);
      return { xsum: {
        top:[...x.top], bottom:[...x.bottom], left:[...x.left], right:[...x.right],
      }};
    },
    deserialize(p, j) {
      const nRows = p.rows != null ? p.rows : p.N;
      const nCols = p.cols != null ? p.cols : p.N;
      p.xsum = makeSides(nRows, nCols);
      if (j.xsum) {
        const copy = (dst, src) => { if (!src) return; const n = Math.min(dst.length, src.length); for (let k = 0; k < n; k++) dst[k] = src[k]; };
        copy(p.xsum.top, j.xsum.top);
        copy(p.xsum.bottom, j.xsum.bottom);
        copy(p.xsum.left, j.xsum.left);
        copy(p.xsum.right, j.xsum.right);
      }
    },

    findConflicts(p, ctx) {
      const N = p.N, values = p.values;
      const nRows = p.rows != null ? p.rows : N;
      const nCols = p.cols != null ? p.cols : N;
      const clues = p.xsum || makeSides(nRows, nCols);
      for (const side of ['top','bottom','left','right']) {
        const arr = clues[side];
        if (!arr) continue;
        for (let idx = 0; idx < arr.length; idx++) {
          const clue = arr[idx]; if (!clue) continue;
          const cells = lineCells(side, idx, nRows, nCols, p.deleted);
          if (!cells.length) continue;
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
      const nRows = ctx.rows != null ? ctx.rows : N;
      const nCols = ctx.cols != null ? ctx.cols : N;
      const total = ctx.total != null ? ctx.total : nRows * nCols;
      const clues = p.xsum || makeSides(nRows, nCols);
      /* Pack every clued line into: { cells:[…], clue }. */
      const lines = [];
      for (const side of ['top','bottom','left','right']) {
        const arr = clues[side]; if (!arr) continue;
        for (let idx = 0; idx < arr.length; idx++) {
          if (!arr[idx]) continue;
          const cells = lineCells(side, idx, nRows, nCols, ctx.deleted);
          if (cells.length) lines.push({ cells, clue: arr[idx] });
        }
      }
      if (!lines.length) return null;
      /* Per cell: list of (lineIdx, pos). */
      const lookup = Array.from({ length: total }, () => []);
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
