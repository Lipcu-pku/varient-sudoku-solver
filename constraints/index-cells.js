/*
 * constraints/index-cells.js
 *
 * Two self-referential per-cell constraints, each applied only to
 * user-selected cells:
 *
 *   Column Index — if r[X][Y] = Z then r[X][Z] = Y
 *                  (the value Z in a marked cell at (X, Y) tells you
 *                   the column of the digit Y in row X).
 *   Row Index    — if r[X][Y] = Z then r[Z][Y] = X
 *                  (symmetric, along the column instead of the row).
 *
 * State model:
 *   p.colIndex  — Int8Array(N*N), 1 = cell participates in column-index
 *   p.rowIndex  — Int8Array(N*N), 1 = cell participates in row-index
 */
self.SudokuConstraints.register({
  id: 'index-cells',

  newFields(p) {
    p.colIndex = new Int8Array(p.N * p.N);
    p.rowIndex = new Int8Array(p.N * p.N);
  },
  serialize(p) {
    return {
      colIndex: [...(p.colIndex || [])],
      rowIndex: [...(p.rowIndex || [])],
    };
  },
  deserialize(p, j) {
    const total = p.N * p.N;
    p.colIndex = new Int8Array(total);
    p.rowIndex = new Int8Array(total);
    if (j.colIndex && j.colIndex.length === total) p.colIndex.set(j.colIndex);
    if (j.rowIndex && j.rowIndex.length === total) p.rowIndex.set(j.rowIndex);
  },

  findConflicts(p, ctx) {
    const N = p.N, values = p.values;
    const col = p.colIndex || new Int8Array(N * N);
    const row = p.rowIndex || new Int8Array(N * N);
    for (let i = 0; i < N * N; i++) {
      const v = values[i]; if (!v) continue;
      const r = (i / N) | 0, c = i % N;
      if (col[i]) {
        /* Column-index: partner in same row at column (v-1) must equal c+1. */
        const j = r * N + (v - 1);
        const pv = values[j];
        if (pv && pv !== c + 1) { ctx.conflicts.add(i); ctx.conflicts.add(j); }
      }
      if (row[i]) {
        /* Row-index: partner in same column at row (v-1) must equal r+1. */
        const j = (v - 1) * N + c;
        const pv = values[j];
        if (pv && pv !== r + 1) { ctx.conflicts.add(i); ctx.conflicts.add(j); }
      }
    }
  },

  solverInit(p, ctx) {
    const N = ctx.N;
    const col = p.colIndex || new Int8Array(N * N);
    const row = p.rowIndex || new Int8Array(N * N);
    /* Skip the plugin entirely when the puzzle has no marked cells. */
    let any = false;
    for (let i = 0; i < N * N; i++) if (col[i] || row[i]) { any = true; break; }
    if (!any) return null;
    /* Precompute per-row and per-column lists of marked cells so `solverCheck`
       can scan just the relevant peers rather than the whole grid. */
    const colRow = Array.from({ length: N }, () => []);
    const rowCol = Array.from({ length: N }, () => []);
    for (let i = 0; i < N * N; i++) {
      const r = (i / N) | 0, c = i % N;
      if (col[i]) colRow[r].push({ i, c });
      if (row[i]) rowCol[c].push({ i, r });
    }
    return { col, row, colRow, rowCol };
  },

  solverCheck(p, ctx, h, i, v) {
    const N = ctx.N, grid = ctx.grid;
    const r = (i / N) | 0, c = i % N;
    /* If this cell is a column-index cell: partner (r, v-1) must equal c+1. */
    if (h.col[i]) {
      const j = r * N + (v - 1);
      if (j !== i) {
        const pv = grid[j];
        if (pv && pv !== c + 1) return false;
      } else {
        /* Self-partner: v-1 == c, so v == c+1 is the only consistent case. */
        if (v !== c + 1) return false;
      }
    }
    if (h.row[i]) {
      const j = (v - 1) * N + c;
      if (j !== i) {
        const pv = grid[j];
        if (pv && pv !== r + 1) return false;
      } else {
        if (v !== r + 1) return false;
      }
    }
    /* Reverse-partner: any marked cell on this row whose current value points
       at our column must have (v == that cell's column+1). */
    for (const peer of h.colRow[r]) {
      if (peer.i === i) continue;
      const pv = grid[peer.i]; if (!pv) continue;
      if (pv - 1 === c && v !== peer.c + 1) return false;
    }
    for (const peer of h.rowCol[c]) {
      if (peer.i === i) continue;
      const pv = grid[peer.i]; if (!pv) continue;
      if (pv - 1 === r && v !== peer.r + 1) return false;
    }
    return true;
  },

  solverCommit() {},
  solverUnplace() {},

  solverForbid(p, ctx, h, i, used) {
    const N = ctx.N, grid = ctx.grid;
    const r = (i / N) | 0, c = i % N;
    /* When this cell is marked, forbid v values whose partner is filled with
       a mismatched value. */
    if (h.col[i]) {
      for (let v = 1; v <= N; v++) {
        const j = r * N + (v - 1);
        if (j === i) {
          if (v !== c + 1) used |= ctx.bit(v);
        } else {
          const pv = grid[j];
          if (pv && pv !== c + 1) used |= ctx.bit(v);
        }
      }
    }
    if (h.row[i]) {
      for (let v = 1; v <= N; v++) {
        const j = (v - 1) * N + c;
        if (j === i) {
          if (v !== r + 1) used |= ctx.bit(v);
        } else {
          const pv = grid[j];
          if (pv && pv !== r + 1) used |= ctx.bit(v);
        }
      }
    }
    /* Reverse-partner pruning. */
    for (const peer of h.colRow[r]) {
      if (peer.i === i) continue;
      const pv = grid[peer.i]; if (!pv) continue;
      if (pv - 1 === c) {
        const forced = peer.c + 1;
        for (let v = 1; v <= N; v++) if (v !== forced) used |= ctx.bit(v);
      }
    }
    for (const peer of h.rowCol[c]) {
      if (peer.i === i) continue;
      const pv = grid[peer.i]; if (!pv) continue;
      if (pv - 1 === r) {
        const forced = peer.r + 1;
        for (let v = 1; v <= N; v++) if (v !== forced) used |= ctx.bit(v);
      }
    }
    return used;
  },
});
