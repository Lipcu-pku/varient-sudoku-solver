/*
 * sudoku-core.js — model + solver for variant sudoku.
 *
 * Supports:
 *   - Any A×B box shape (grid is N×N where N = A*B, 4 ≤ N ≤ 16)
 *   - Jigsaw regions (arbitrary partition of the N×N grid into N groups of N cells)
 *   - Killer cages (subset of cells with a target sum, no repeats inside a cage)
 *   - Thermometers (path of cells with strictly increasing values from bulb to tip)
 *   - German whisper lines (adjacent cells differ by ≥ ⌈N/2⌉)
 *   - Region sum lines (segments of the line inside each region share a sum)
 *   - Modular lines (every 3 consecutive cells cover residues {0,1,2} mod 3)
 *   - Kropki dots between adjacent cells (white = consecutive, black = ratio 2)
 *   - Compare marks between adjacent cells (a<b or a>b)
 *   - XV clues between adjacent cells (X = sum 10, V = sum 5)
 *   - Odd/Even cell marks (parity constraint per cell)
 *   - Skyscraper edge clues (visible-count from each of the four sides)
 *   - Sandwich edge clues (sum of digits strictly between 1 and N per row/col)
 *   - Rainbow / Spectradoku (each row/col/box holds all N colors; every
 *     (digit, color) pair is unique)
 *   - Renban lines (a set of consecutive digits, in any order, no repeats)
 *   - Palindrome lines (digits read the same forwards and backwards)
 *   - Entropic lines (every 3 consecutive cells cover Low/Mid/High tercile)
 *   - Parity lines (adjacent cells alternate odd / even)
 *   - Arrows ({ base:[cells], path:[cells] } — path digits sum to the
 *     multi-digit number spelled by the base pill)
 *   - Quadruples ({ r, c, digits:[..] } — each listed digit must appear in
 *     at least one of the 2×2 cells whose top-left corner is (r, c))
 *   - Diagonal (X-Sudoku), Anti-Knight, Anti-King, Anti-Consecutive toggles
 *
 * A puzzle is a plain object:
 *   {
 *     N, boxR, boxC,
 *     values:   Uint8Array(N*N),  // 0 = empty, otherwise 1..N
 *     given:    Uint8Array(N*N),  // 1 if the value is a given clue
 *     regions:  Int8Array(N*N),   // region index for each cell (0..N-1); default rectangular boxes
 *     cages:    [{ cells:[idx,...], sum:number|null }, ...],
 *     thermos:  [[idx,...], ...],           // bulb first
 *     whispers: [[idx,...], ...],           // adjacency-diff line
 *     regionSums:[[idx,...], ...],          // same-sum-per-region-segment line
 *     modulars: [[idx,...], ...],           // residue-cycle line
 *     kropki:   [{ a, b, kind }, ...],      // kind: 'w' | 'b' (adjacent cells only)
 *     compare:  [{ a, b, kind }, ...],      // kind: 'lt' (a<b) | 'gt' (a>b)
 *     xv:       [{ a, b, kind }, ...],      // kind: 'x' (a+b=10) | 'v' (a+b=5)
 *     parity:   Int8Array(N*N),             // 0 = none, 1 = odd, 2 = even
 *     sky:      { top:[N], bottom:[N], left:[N], right:[N] },  // 0 = no clue
 *     sandwich: { top:[N], bottom:[N], left:[N], right:[N] },  // 0 = no clue
 *     rainbow:  Int8Array(N*N),             // 0 = no color, 1..N = assigned color
 *     flags:    { diagonal, antiKnight, antiKing, antiConsecutive },
 *   }
 */
/* Attach to `self` so this file loads in both a browser window (where
   self === window) AND inside a Web Worker (which has `self` but no
   `window`). solver-worker.js relies on that dual mode. */
self.SudokuCore = (function () {
  const MIN_N = 4;
  const MAX_N = 16;

  /* Digit char <-> value.  1..9 map to "1".."9"; 10..16 map to "A".."G". */
  const CHARS = '.123456789ABCDEFG';
  function digitToChar(v) { return v > 0 ? CHARS[v] : ''; }
  function charToDigit(ch) {
    if (!ch) return 0;
    const c = ch.toUpperCase();
    const i = CHARS.indexOf(c);
    return i > 0 ? i : 0;
  }
  function isDigitKey(ch, N) {
    const v = charToDigit(ch);
    return v >= 1 && v <= N;
  }

  /* Rectangular-box region index. For a rows×cols grid (assumed to be
     tiled by boxR × boxC boxes), produce a default region assignment where
     each cell gets its box index. This is only well-defined when
     `boxR` divides `rows` and `boxC` divides `cols`; the caller should
     force jigsaw regions when it doesn't. */
  function rectRegions(rowsOrN, colsOrBoxR, boxROrBoxC, boxCArg) {
    /* Two calling conventions:
         rectRegions(N, boxR, boxC)               (square legacy)
         rectRegions(rows, cols, boxR, boxC)      (rectangular new)  */
    let rows, cols, boxR, boxC;
    if (boxCArg === undefined) {
      rows = cols = rowsOrN; boxR = colsOrBoxR; boxC = boxROrBoxC;
    } else {
      rows = rowsOrN; cols = colsOrBoxR; boxR = boxROrBoxC; boxC = boxCArg;
    }
    const boxesPerRow = Math.ceil(cols / boxC);
    const out = new Int8Array(rows * cols);
    for (let i = 0; i < rows * cols; i++) {
      const r = (i / cols) | 0, c = i % cols;
      out[i] = Math.floor(r / boxR) * boxesPerRow + Math.floor(c / boxC);
    }
    return out;
  }

  /* Sensible default digit-domain size for a rectangular grid. */
  function defaultDigits(rows, cols) { return Math.max(rows, cols); }
  function anyHole(deleted) {
    if (!deleted) return false;
    for (let i = 0; i < deleted.length; i++) if (deleted[i]) return true;
    return false;
  }

  function newPuzzle(N, boxR, boxC, opts) {
    /* Legacy signature newPuzzle(N, boxR, boxC) → square N×N with digits N.
       New signature newPuzzle(N, boxR, boxC, {rows, cols, digits, deleted})
       → any rectangular bounding box, optionally with deleted cells. */
    opts = opts || {};
    const rows   = opts.rows   != null ? opts.rows   : N;
    const cols   = opts.cols   != null ? opts.cols   : N;
    const digits = opts.digits != null ? opts.digits : N;
    const total  = rows * cols;
    const deleted = new Uint8Array(total);
    if (opts.deleted) {
      const src = opts.deleted;
      const len = Math.min(src.length, total);
      for (let i = 0; i < len; i++) deleted[i] = src[i] ? 1 : 0;
    }
    const p = {
      /* `N` remains the canonical digit-count so all plugin code that reads
         `ctx.N` / `p.N` keeps working unchanged. On classic square puzzles
         N == rows == cols == digits. */
      N: digits,
      digits,
      rows, cols,
      boxR, boxC,
      deleted,
      values:  new Uint8Array(total),
      given:   new Uint8Array(total),
      regions: rectRegions(rows, cols, boxR, boxC),
      cages:   [],
      thermos: [],
      whispers:   [],
      regionSums: [],
      modulars:   [],
      kropki:     [],
      compare:    [],
      xv:         [],
      parity:   new Int8Array(total),
      sky:      { top: new Uint8Array(cols), bottom: new Uint8Array(cols),
                  left: new Uint8Array(rows), right: new Uint8Array(rows) },
      sandwich: { top: new Uint8Array(cols), bottom: new Uint8Array(cols),
                  left: new Uint8Array(rows), right: new Uint8Array(rows) },
      rainbow:  new Int8Array(total),
      flags:   { diagonal:false, antiKnight:false, antiKing:false, antiConsecutive:false, disjoint:false },
    };
    /* Deleted cells never carry a region — mark as -1. */
    for (let i = 0; i < total; i++) if (deleted[i]) p.regions[i] = -1;
    /* Plugin-managed fields (constraints/*.js). */
    for (const c of pluginList()) if (c.newFields) c.newFields(p);
    return p;
  }

  function pluginList() {
    return self.SudokuConstraints ? self.SudokuConstraints.all() : [];
  }

  /* Whisper minimum difference between adjacent cells: ⌈N/2⌉. */
  function whisperMin(N) { return (N + 1) >> 1; }

  /* Fresh puzzle at a new size, dropping variant data that no longer fits. */
  function resize(p, N, boxR, boxC) {
    const q = newPuzzle(N, boxR, boxC);
    return q;
  }

  /* ---------- Cell adjacency helpers used by constraints ---------- */
  const KNIGHT_D = [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]];
  const KING_D   = [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]];
  /* Legacy signature forEachOffset(r, c, N, offsets, fn) still supported
     for square grids. New signature forEachOffset(r, c, rows, cols, offsets, fn)
     handles rectangular / irregular. Deleted-cell skipping is the caller's
     responsibility (they know the puzzle context). */
  function forEachOffset(r, c, rowsOrN, colsOrOffsets, offsetsOrFn, fnMaybe) {
    let rows, cols, offsets, fn;
    if (fnMaybe === undefined) {
      /* 5-arg square form */
      rows = cols = rowsOrN;
      offsets = colsOrOffsets;
      fn = offsetsOrFn;
    } else {
      rows = rowsOrN; cols = colsOrOffsets;
      offsets = offsetsOrFn; fn = fnMaybe;
    }
    for (const [dr, dc] of offsets) {
      const nr = r + dr, nc = c + dc;
      if (nr >= 0 && nr < rows && nc >= 0 && nc < cols) fn(nr * cols + nc);
    }
  }

  /* ---------- Conflict scan (all defined constraints) ---------- */
  function findConflicts(p) {
    const { N, values, regions, cages, thermos, sky, flags } = p;
    const nRows = p.rows != null ? p.rows : N;
    const nCols = p.cols != null ? p.cols : N;
    const total = nRows * nCols;
    const deleted = p.deleted || new Uint8Array(total);
    const whispers   = p.whispers   || [];
    const regionSums = p.regionSums || [];
    const modulars   = p.modulars   || [];
    const kropki     = p.kropki     || [];
    const compare    = p.compare    || [];
    const xv         = p.xv         || [];
    const parity     = p.parity     || new Int8Array(total);
    const sandwich   = p.sandwich   || { top:new Uint8Array(nCols), bottom:new Uint8Array(nCols),
                                         left:new Uint8Array(nRows), right:new Uint8Array(nRows) };
    const rainbow    = p.rainbow    || new Int8Array(total);
    const wMin = whisperMin(N);
    const conflicts = new Set();
    const rowMaps  = Array.from({ length: nRows }, () => new Map());
    const colMaps  = Array.from({ length: nCols }, () => new Map());
    const boxes = new Map();  /* keyed by region id — region count is variable */
    const diag1 = new Map(), diag2 = new Map();

    function clash(a, b) { conflicts.add(a); conflicts.add(b); }
    function put(map, key, i) {
      if (map.has(key)) clash(map.get(key), i);
      else map.set(key, i);
    }
    function putBox(regionId, v, i) {
      if (regionId < 0) return;
      let m = boxes.get(regionId);
      if (!m) { m = new Map(); boxes.set(regionId, m); }
      put(m, v, i);
    }

    for (let i = 0; i < total; i++) {
      if (deleted[i]) continue;
      const v = values[i]; if (!v) continue;
      const r = (i / nCols) | 0, c = i % nCols;
      put(rowMaps[r], v, i);
      put(colMaps[c], v, i);
      putBox(regions[i], v, i);
      if (flags.diagonal && nRows === nCols) {
        if (r === c)             put(diag1, v, i);
        if (r + c === nRows - 1) put(diag2, v, i);
      }
    }

    if (flags.antiKnight || flags.antiKing || flags.antiConsecutive) {
      for (let i = 0; i < total; i++) {
        if (deleted[i]) continue;
        const v = values[i]; if (!v) continue;
        const r = (i / nCols) | 0, c = i % nCols;
        if (flags.antiKnight) {
          forEachOffset(r, c, nRows, nCols, KNIGHT_D, j => { if (!deleted[j] && values[j] === v) clash(i, j); });
        }
        if (flags.antiKing) {
          forEachOffset(r, c, nRows, nCols, KING_D, j => { if (!deleted[j] && values[j] === v) clash(i, j); });
        }
        if (flags.antiConsecutive) {
          forEachOffset(r, c, nRows, nCols, [[-1,0],[1,0],[0,-1],[0,1]], j => {
            if (!deleted[j] && values[j] && Math.abs(values[j] - v) === 1) clash(i, j);
          });
        }
      }
    }

    /* Thermometers: strictly increasing along the path. */
    for (const t of thermos) {
      let prev = 0, prevIdx = -1;
      for (const i of t) {
        const v = values[i];
        if (!v) { prev = 0; prevIdx = -1; continue; }
        if (prev && v <= prev) clash(prevIdx, i);
        prev = v; prevIdx = i;
      }
    }

    /* Skyscraper clues: check filled rows/cols. */
    function checkSky(cells, clue, mark) {
      if (!clue) return;
      const vs = cells.map(i => values[i]);
      if (vs.some(v => !v)) return;
      let seen = 0, maxSoFar = 0;
      for (const v of vs) { if (v > maxSoFar) { maxSoFar = v; seen++; } }
      if (seen !== clue) mark();
    }
    /* Skyscraper: only meaningful on rectangular grids without holes. */
    if (!p.deleted || !anyHole(p.deleted)) {
      for (let r = 0; r < nRows; r++) {
        const row = [], rowRev = [];
        for (let c = 0; c < nCols; c++) { row.push(r*nCols+c); rowRev.push(r*nCols+(nCols-1-c)); }
        checkSky(row,    sky.left && sky.left[r],  () => row.forEach(i => conflicts.add(i)));
        checkSky(rowRev, sky.right && sky.right[r], () => rowRev.forEach(i => conflicts.add(i)));
      }
      for (let c = 0; c < nCols; c++) {
        const col = [], colRev = [];
        for (let r = 0; r < nRows; r++) { col.push(r*nCols+c); colRev.push((nRows-1-r)*nCols+c); }
        checkSky(col,    sky.top && sky.top[c],    () => col.forEach(i => conflicts.add(i)));
        checkSky(colRev, sky.bottom && sky.bottom[c], () => colRev.forEach(i => conflicts.add(i)));
      }
    }

    /* Whisper lines: consecutive cells differ by ≥ wMin when both filled. */
    for (const line of whispers) {
      for (let k = 1; k < line.length; k++) {
        const a = line[k - 1], b = line[k];
        const va = values[a], vb = values[b];
        if (va && vb && Math.abs(va - vb) < wMin) clash(a, b);
      }
    }

    /* Modular lines: within any window of 3 consecutive filled cells,
       all three residues mod 3 must appear (i.e. no repeated residue). */
    for (const line of modulars) {
      for (let k = 0; k + 2 < line.length; k++) {
        const a = line[k], b = line[k+1], c = line[k+2];
        const va = values[a], vb = values[b], vc = values[c];
        if (!va || !vb || !vc) continue;
        const ra = va % 3, rb = vb % 3, rc = vc % 3;
        if (ra === rb) clash(a, b);
        if (rb === rc) clash(b, c);
        if (ra === rc) clash(a, c);
      }
    }

    /* Region-sum lines: each maximal segment in the same region shares one sum.
       Only compare fully-filled segments; short-circuit on any mismatch. */
    for (const line of regionSums) {
      const segs = [];  /* array of { cells:[], sum:0, full:bool } */
      let cur = null, curRegion = -1;
      for (const i of line) {
        const rg = regions[i];
        if (rg !== curRegion) {
          if (cur) segs.push(cur);
          cur = { cells: [], sum: 0, full: true };
          curRegion = rg;
        }
        cur.cells.push(i);
        if (values[i]) cur.sum += values[i]; else cur.full = false;
      }
      if (cur) segs.push(cur);
      let ref = -1;
      for (const s of segs) {
        if (!s.full) continue;
        if (ref === -1) ref = s.sum;
        else if (s.sum !== ref) s.cells.forEach(i => conflicts.add(i));
      }
    }

    /* Kropki dots: white = consecutive, black = ratio 2. Check filled pairs. */
    for (const d of kropki) {
      const va = values[d.a], vb = values[d.b];
      if (!va || !vb) continue;
      if (d.kind === 'w') {
        if (Math.abs(va - vb) !== 1) clash(d.a, d.b);
      } else {
        if (!(va === 2*vb || vb === 2*va)) clash(d.a, d.b);
      }
    }

    /* Compare marks: a<b or a>b. Both sides must be filled to compare. */
    for (const d of compare) {
      const va = values[d.a], vb = values[d.b];
      if (!va || !vb) continue;
      if (d.kind === 'lt') { if (!(va < vb)) clash(d.a, d.b); }
      else                  { if (!(va > vb)) clash(d.a, d.b); }
    }

    /* XV clues: X = sum 10, V = sum 5. Both cells must be filled. */
    for (const d of xv) {
      const va = values[d.a], vb = values[d.b];
      if (!va || !vb) continue;
      const target = d.kind === 'x' ? 10 : 5;
      if (va + vb !== target) clash(d.a, d.b);
    }

    /* Parity marks: filled cell must match its parity mark (1 odd / 2 even). */
    for (let i = 0; i < total; i++) {
      if (deleted[i]) continue;
      const par = parity[i]; if (!par) continue;
      const v = values[i]; if (!v) continue;
      if ((par === 1 && (v & 1) === 0) || (par === 2 && (v & 1) === 1)) conflicts.add(i);
    }

    /* Sandwich clues: check filled rows/cols only. */
    function sandwichSum(vs) {
      let lo = -1, hi = -1;
      for (let k = 0; k < vs.length; k++) {
        if (vs[k] === 1) lo = k;
        else if (vs[k] === N) hi = k;
      }
      if (lo < 0 || hi < 0) return null;
      const a = Math.min(lo, hi), b = Math.max(lo, hi);
      let s = 0;
      for (let k = a + 1; k < b; k++) s += vs[k];
      return s;
    }
    function checkSandwich(cells, clue, mark) {
      if (!clue) return;
      const vs = cells.map(i => values[i]);
      if (vs.some(v => !v)) return;
      const s = sandwichSum(vs);
      if (s !== clue) mark();
    }
    if (!anyHole(deleted)) {
      for (let r = 0; r < nRows; r++) {
        const row = [], rowRev = [];
        for (let c = 0; c < nCols; c++) { row.push(r*nCols+c); rowRev.push(r*nCols+(nCols-1-c)); }
        checkSandwich(row,    sandwich.left && sandwich.left[r],  () => row.forEach(i => conflicts.add(i)));
        checkSandwich(rowRev, sandwich.right && sandwich.right[r], () => rowRev.forEach(i => conflicts.add(i)));
      }
      for (let c = 0; c < nCols; c++) {
        const col = [], colRev = [];
        for (let r = 0; r < nRows; r++) { col.push(r*nCols+c); colRev.push((nRows-1-r)*nCols+c); }
        checkSandwich(col,    sandwich.top && sandwich.top[c],    () => col.forEach(i => conflicts.add(i)));
        checkSandwich(colRev, sandwich.bottom && sandwich.bottom[c], () => colRev.forEach(i => conflicts.add(i)));
      }
    }

    /* Cages: no repeats and sum bookkeeping. */
    for (const cage of cages) {
      if (!cage.cells.length) continue;
      const seen = new Map();
      let sum = 0, filled = 0;
      for (const i of cage.cells) {
        const v = values[i]; if (!v) continue;
        filled++;
        sum += v;
        if (seen.has(v)) clash(seen.get(v), i);
        else seen.set(v, i);
      }
      if (cage.sum != null) {
        const remaining = cage.cells.length - filled;
        if (remaining === 0 && sum !== cage.sum) {
          for (const i of cage.cells) conflicts.add(i);
        } else if (sum > cage.sum) {
          for (const i of cage.cells) if (values[i]) conflicts.add(i);
        } else {
          /* min/max feasibility with the leftover cells. */
          const need = cage.sum - sum;
          if (remaining > 0) {
            const usedMask = seen.size ? [...seen.keys()].reduce((m,v)=>m|(1<<(v-1)),0) : 0;
            let lo = 0, hi = 0, picked = 0;
            for (let v = 1; v <= N && picked < remaining; v++) {
              if (usedMask & (1 << (v-1))) continue;
              lo += v; picked++;
            }
            picked = 0;
            for (let v = N; v >= 1 && picked < remaining; v--) {
              if (usedMask & (1 << (v-1))) continue;
              hi += v; picked++;
            }
            if (need < lo || need > hi) {
              for (const i of cage.cells) if (values[i]) conflicts.add(i);
            }
          }
        }
      }
    }

    /* Plugin-managed constraints run their own conflict scans. Each plugin
       gets a shared context so it can hit `ctx.conflicts` without touching
       the closure. */
    {
      const ctx = { conflicts };
      for (const plugin of pluginList()) {
        if (plugin.findConflicts) plugin.findConflicts(p, ctx);
      }
    }

    /* Rainbow: within each row/col/box, no two cells may share the same
       non-zero color (colors partition the row/col/box into N groups); and
       across the whole grid, no two cells with the same non-zero digit may
       share the same non-zero color. */
    {
      const rowC  = Array.from({ length: N }, () => new Map());
      const colC  = Array.from({ length: N }, () => new Map());
      const boxC  = Array.from({ length: N }, () => new Map());
      const digC  = Array.from({ length: N + 1 }, () => new Map());
      for (let i = 0; i < N * N; i++) {
        const rb = rainbow[i]; if (!rb) continue;
        const r = (i / N) | 0, c = i % N;
        if (rowC[r].has(rb))              clash(rowC[r].get(rb), i);
        else rowC[r].set(rb, i);
        if (colC[c].has(rb))              clash(colC[c].get(rb), i);
        else colC[c].set(rb, i);
        if (boxC[regions[i]].has(rb))     clash(boxC[regions[i]].get(rb), i);
        else boxC[regions[i]].set(rb, i);
        const v = values[i];
        if (v) {
          if (digC[v].has(rb))            clash(digC[v].get(rb), i);
          else digC[v].set(rb, i);
        }
      }
    }

    return conflicts;
  }

  /* Region check: N cells each, N regions, cover the whole grid. */
  /* Legacy signature regionsValid(regions, N) is preserved for callers that
     still assume an N×N grid. New callers should pass the whole puzzle
     object so we can inspect its deleted-cell bitmap. Every non-deleted
     cell must have a valid region and each region must hold exactly
     `digits` cells. */
  function regionsValid(regionsOrP, N) {
    let regions, digits, total, deleted;
    if (regionsOrP && regionsOrP.regions) {
      const p = regionsOrP;
      regions = p.regions;
      digits  = p.digits != null ? p.digits : p.N;
      const nRows = p.rows != null ? p.rows : p.N;
      const nCols = p.cols != null ? p.cols : p.N;
      total   = nRows * nCols;
      deleted = p.deleted || new Uint8Array(total);
    } else {
      regions = regionsOrP;
      digits  = N;
      total   = N * N;
      deleted = new Uint8Array(total);
    }
    const counts = new Map();
    for (let i = 0; i < total; i++) {
      if (deleted[i]) continue;
      const r = regions[i];
      if (r < 0) return false;
      counts.set(r, (counts.get(r) || 0) + 1);
    }
    for (const [, c] of counts) if (c !== digits) return false;
    return true;
  }

  /* ---------- Solver ---------- */
  const SOL_CAP = 200;

  function findSolutions(p) {
    const { N, values, regions, cages, thermos, sky, flags } = p;
    const nRows = p.rows != null ? p.rows : N;
    const nCols = p.cols != null ? p.cols : N;
    const total = nRows * nCols;
    const deleted = p.deleted || new Uint8Array(total);
    const whispers   = p.whispers   || [];
    const regionSums = p.regionSums || [];
    const modulars   = p.modulars   || [];
    const kropki     = p.kropki     || [];
    const compare    = p.compare    || [];
    const xv         = p.xv         || [];
    const parity     = p.parity     || new Int8Array(total);
    const sandwich   = p.sandwich   || { top:new Uint8Array(nCols), bottom:new Uint8Array(nCols),
                                         left:new Uint8Array(nRows), right:new Uint8Array(nRows) };
    const rainbow    = p.rainbow    || new Int8Array(total);
    const wMin = whisperMin(N);
    /* Region count for the box mask arrays. On classic puzzles this is N;
       on irregular puzzles it's (existing cells / digits). */
    let regionCount = 0;
    for (let i = 0; i < total; i++) {
      if (deleted[i]) continue;
      const r = regions[i];
      if (r >= regionCount) regionCount = r + 1;
    }
    if (!regionsValid(p)) return { solutions: [], reachedCap: false, invalidRegions: true };

    /* Rainbow partition pre-check: each row/col/box may hold each non-zero
       color at most once. This depends only on the coloring, not on digits,
       so if it fails there is no solution regardless of placement. */
    {
      const rowC = Array.from({ length: nRows }, () => new Set());
      const colC = Array.from({ length: nCols }, () => new Set());
      const boxC = Array.from({ length: regionCount }, () => new Set());
      for (let i = 0; i < total; i++) {
        if (deleted[i]) continue;
        const rb = rainbow[i]; if (!rb) continue;
        const r = (i / nCols) | 0, c = i % nCols;
        if (rowC[r].has(rb) || colC[c].has(rb) || boxC[regions[i]].has(rb)) {
          return { solutions: [], reachedCap: false };
        }
        rowC[r].add(rb); colC[c].add(rb); boxC[regions[i]].add(rb);
      }
    }

    const full = (1 << N) - 1;
    const rowM = new Array(nRows).fill(0);
    const colM = new Array(nCols).fill(0);
    const boxM = new Array(regionCount).fill(0);
    let d1 = 0, d2 = 0;
    const grid = new Uint8Array(total);

    /* Cage bookkeeping */
    const cageOf = new Array(total).fill(-1);
    cages.forEach((cage, ci) => { for (const i of cage.cells) cageOf[i] = ci; });
    const cageMask = new Int32Array(cages.length);
    const cageSum  = new Int32Array(cages.length);
    const cageFill = new Int32Array(cages.length);

    /* Thermo lookup: for each cell, list of (thermoIdx, positionOnPath). */
    const thermoAt = Array.from({ length: total }, () => []);
    thermos.forEach((t, ti) => t.forEach((i, pos) => thermoAt[i].push([ti, pos])));
    const thermoValues = thermos.map(t => new Uint8Array(t.length));

    /* Whisper lookup: adjacency pairs by cell (undirected). */
    const whisperNbrs = Array.from({ length: total }, () => []);
    for (const line of whispers) {
      for (let k = 1; k < line.length; k++) {
        whisperNbrs[line[k-1]].push(line[k]);
        whisperNbrs[line[k]].push(line[k-1]);
      }
    }

    /* Modular lookup: for each cell, all sliding 3-windows it belongs to. */
    const modWindows = Array.from({ length: total }, () => []);
    for (const line of modulars) {
      for (let k = 0; k + 2 < line.length; k++) {
        const trio = [line[k], line[k+1], line[k+2]];
        for (const c of trio) modWindows[c].push(trio);
      }
    }

    /* Kropki lookup: for each cell, list of { other, kind }. */
    const kropkiNbrs = Array.from({ length: total }, () => []);
    for (const d of kropki) {
      kropkiNbrs[d.a].push({ other: d.b, kind: d.kind });
      kropkiNbrs[d.b].push({ other: d.a, kind: d.kind });
    }

    /* Constraint plugins (constraints/*.js) each get a chance to precompute
       their own lookups. We defer building `pluginCtx` until after the
       shared `grid` array is created (place/unplace read/write it), and
       stash each plugin's handle alongside its id. Only plugins whose
       solverInit returns non-null appear in `activePlugins` — that skips
       the hot-path call entirely for constraints not in this puzzle. */
    let activePlugins = [];
    let pluginCtx = null;

    /* Compare lookup: for each cell, list of { other, rel } where rel = 'lt'
       means this cell < other, and 'gt' means this cell > other. */
    const compareNbrs = Array.from({ length: total }, () => []);
    for (const d of compare) {
      compareNbrs[d.a].push({ other: d.b, rel: d.kind });
      compareNbrs[d.b].push({ other: d.a, rel: d.kind === 'lt' ? 'gt' : 'lt' });
    }

    /* XV lookup: for each cell, list of { other, target } (10 for X, 5 for V). */
    const xvNbrs = Array.from({ length: total }, () => []);
    for (const d of xv) {
      const target = d.kind === 'x' ? 10 : 5;
      xvNbrs[d.a].push({ other: d.b, target });
      xvNbrs[d.b].push({ other: d.a, target });
    }

    /* Parity per-cell forbidden mask. Cell with parity=1 (odd) must reject
       even values, and vice versa. Precompute once. */
    const oddForbidden  = ((v) => { let m = 0; for (let x = 2; x <= v; x += 2) m |= 1 << (x-1); return m; })(N);
    const evenForbidden = ((v) => { let m = 0; for (let x = 1; x <= v; x += 2) m |= 1 << (x-1); return m; })(N);
    const parityMask = new Int32Array(total);
    for (let i = 0; i < total; i++) {
      if (parity[i] === 1) parityMask[i] = oddForbidden;
      else if (parity[i] === 2) parityMask[i] = evenForbidden;
    }

    /* Rainbow: for each digit v (1..N), a bitmask of colors already assigned
       to a cell holding v. When placing v at a colored cell, that cell's
       color bit must not already be set. */
    const digitColorMask = new Int32Array(N + 1);

    /* Region-sum: for each cell, list of (lineIdx, segmentKey). Segments are
       maximal runs of the line inside one region — precompute segment groups
       and track their partial fill state. */
    const rsSegOf = Array.from({ length: total }, () => []);
    const rsSegs = []; /* { line, region, cells, sum, filled } */
    const rsLineToSegs = regionSums.map(() => []);
    regionSums.forEach((line, li) => {
      let cur = null, curR = -1;
      const emit = () => {
        const k = rsSegs.length;
        rsSegs.push(cur);
        rsLineToSegs[li].push(k);
        for (const i of cur.cells) rsSegOf[i].push(k);
      };
      for (const i of line) {
        const rg = regions[i];
        if (rg !== curR) {
          if (cur) emit();
          cur = { line: li, region: rg, cells: [], sum: 0, filled: 0 };
          curR = rg;
        }
        cur.cells.push(i);
      }
      if (cur) emit();
    });

    function bit(v) { return 1 << (v - 1); }
    function pop(m) { let c = 0; while (m) { m &= m - 1; c++; } return c; }
    /* Diagonals only well-defined on square grids. */
    const isSquare = nRows === nCols;
    function onDiag1(r, c) { return isSquare && r === c; }
    function onDiag2(r, c) { return isSquare && r + c === nRows - 1; }

    /* Check-then-commit: verify every constraint, then mutate state. */
    function place(i, v) {
      const r = (i / nCols) | 0, c = i % nCols, b = regions[i], mb = bit(v);
      if (rowM[r] & mb) return false;
      if (colM[c] & mb) return false;
      if (b >= 0 && boxM[b] & mb) return false;
      if (flags.diagonal && isSquare) {
        if (onDiag1(r,c) && (d1 & mb)) return false;
        if (onDiag2(r,c) && (d2 & mb)) return false;
      }
      if (flags.antiKnight) {
        let bad = false;
        forEachOffset(r, c, nRows, nCols, KNIGHT_D, j => { if (!deleted[j] && grid[j] === v) bad = true; });
        if (bad) return false;
      }
      if (flags.antiKing) {
        let bad = false;
        forEachOffset(r, c, nRows, nCols, KING_D, j => { if (!deleted[j] && grid[j] === v) bad = true; });
        if (bad) return false;
      }
      if (flags.antiConsecutive) {
        let bad = false;
        forEachOffset(r, c, nRows, nCols, [[-1,0],[1,0],[0,-1],[0,1]], j => {
          if (!deleted[j] && grid[j] && Math.abs(grid[j] - v) === 1) bad = true;
        });
        if (bad) return false;
      }
      const ci = cageOf[i];
      if (ci >= 0) {
        if (cageMask[ci] & mb) return false;
        const cage = cages[ci];
        const newSum = cageSum[ci] + v;
        const newFill = cageFill[ci] + 1;
        if (cage.sum != null) {
          if (newFill === cage.cells.length) {
            if (newSum !== cage.sum) return false;
          } else if (newSum >= cage.sum) {
            return false;
          }
        }
      }
      const tlist = thermoAt[i];
      for (const [ti, pos] of tlist) {
        const arr = thermoValues[ti];
        const t = thermos[ti];
        const before = pos > 0 ? arr[pos - 1] : 0;
        const after  = pos < t.length - 1 ? arr[pos + 1] : 0;
        if (before && v <= before) return false;
        if (after  && v >= after)  return false;
      }
      /* Whisper: any filled neighbor along a whisper line must differ by ≥ wMin. */
      for (const nb of whisperNbrs[i]) {
        const gv = grid[nb];
        if (gv && Math.abs(gv - v) < wMin) return false;
      }
      /* Kropki: any filled dot-partner must satisfy the dot's rule. */
      for (const { other, kind } of kropkiNbrs[i]) {
        const gv = grid[other]; if (!gv) continue;
        if (kind === 'w') { if (Math.abs(gv - v) !== 1) return false; }
        else               { if (!(v === 2*gv || gv === 2*v)) return false; }
      }
      /* Compare: satisfy this cell's relation to any filled neighbour. */
      for (const { other, rel } of compareNbrs[i]) {
        const gv = grid[other]; if (!gv) continue;
        if (rel === 'lt' ? !(v < gv) : !(v > gv)) return false;
      }
      /* XV: pair sum must equal the target. */
      for (const { other, target } of xvNbrs[i]) {
        const gv = grid[other]; if (!gv) continue;
        if (gv + v !== target) return false;
      }
      /* Parity: v's parity must match the cell's mark. */
      if (parityMask[i] && (parityMask[i] & mb)) return false;
      /* Rainbow: if this cell has a color, digit v may not have been placed
         at another cell of the same color yet. */
      if (rainbow[i]) {
        const cb = 1 << (rainbow[i] - 1);
        if (digitColorMask[v] & cb) return false;
      }
      /* Modular: within any 3-window this cell belongs to, no two of the three
         residues (mod 3) may coincide once at least two cells are filled. */
      const vr = v % 3;
      for (const trio of modWindows[i]) {
        for (const o of trio) {
          if (o === i) continue;
          const gv = grid[o];
          if (gv && (gv % 3) === vr) return false;
        }
      }
      /* Region-sum: enforce when a segment completes, and short-circuit
         when a segment's known sum already exceeds another line-segment. */
      for (const sk of rsSegOf[i]) {
        const seg = rsSegs[sk];
        const newSum = seg.sum + v;
        const newFill = seg.filled + 1;
        if (newFill === seg.cells.length) {
          /* Compare to any already-full sibling segment on the same line. */
          for (const sib of rsLineToSegs[seg.line]) {
            if (sib === sk) continue;
            const s2 = rsSegs[sib];
            if (s2.filled === s2.cells.length && s2.sum !== newSum) return false;
          }
        }
      }
      /* Plugin-managed constraints. Each returned false → reject. */
      for (const { plugin, handle } of activePlugins) {
        if (plugin.solverCheck && !plugin.solverCheck(p, pluginCtx, handle, i, v)) return false;
      }
      /* Commit. */
      grid[i] = v;
      rowM[r] |= mb; colM[c] |= mb;
      if (b >= 0) boxM[b] |= mb;
      if (flags.diagonal && isSquare) {
        if (onDiag1(r,c)) d1 |= mb;
        if (onDiag2(r,c)) d2 |= mb;
      }
      if (ci >= 0) { cageMask[ci] |= mb; cageSum[ci] += v; cageFill[ci] += 1; }
      for (const [ti, pos] of tlist) thermoValues[ti][pos] = v;
      for (const sk of rsSegOf[i]) { rsSegs[sk].sum += v; rsSegs[sk].filled += 1; }
      if (rainbow[i]) digitColorMask[v] |= 1 << (rainbow[i] - 1);
      for (const { plugin, handle } of activePlugins) {
        if (plugin.solverCommit) plugin.solverCommit(p, pluginCtx, handle, i, v);
      }
      return true;
    }

    function unplace(i, v) {
      const r = (i / nCols) | 0, c = i % nCols, b = regions[i], mb = bit(v);
      grid[i] = 0;
      rowM[r] &= ~mb; colM[c] &= ~mb;
      if (b >= 0) boxM[b] &= ~mb;
      if (flags.diagonal && isSquare) {
        if (onDiag1(r,c)) d1 &= ~mb;
        if (onDiag2(r,c)) d2 &= ~mb;
      }
      const ci = cageOf[i];
      if (ci >= 0) { cageMask[ci] &= ~mb; cageSum[ci] -= v; cageFill[ci] -= 1; }
      for (const [ti, pos] of thermoAt[i]) thermoValues[ti][pos] = 0;
      for (const sk of rsSegOf[i]) { rsSegs[sk].sum -= v; rsSegs[sk].filled -= 1; }
      if (rainbow[i]) digitColorMask[v] &= ~(1 << (rainbow[i] - 1));
      for (const { plugin, handle } of activePlugins) {
        if (plugin.solverUnplace) plugin.solverUnplace(p, pluginCtx, handle, i, v);
      }
    }

    /* Build the plugin context now that every hot-path variable exists.
       We hand plugins the shared grid + a couple of tiny helpers so they
       can compose bit-masks without duplicating logic. */
    /* Plugins see rows/cols/deleted/total for grids that aren't classic
       squares. Legacy plugins that only read `N` keep working because N is
       the digit-count. */
    pluginCtx = { N, rows: nRows, cols: nCols, total, deleted, regions, grid, bit, pop, full };
    activePlugins = [];
    for (const plugin of pluginList()) {
      if (!plugin.solverInit) continue;
      const handle = plugin.solverInit(p, pluginCtx);
      if (handle) activePlugins.push({ plugin, handle });
    }

    /* Seed the initial state; reject inconsistent givens up front. */
    for (let i = 0; i < total; i++) {
      if (deleted[i]) continue;
      const v = values[i]; if (!v) continue;
      if (!place(i, v)) return { solutions: [], reachedCap: false };
    }

    /* Skyscraper / Sandwich post-fill check for a completed line. */
    function skySeen(vs) {
      let seen = 0, m = 0;
      for (const v of vs) { if (v > m) { m = v; seen++; } }
      return seen;
    }
    function sandwichBetween(vs) {
      let lo = -1, hi = -1;
      for (let k = 0; k < vs.length; k++) {
        if (vs[k] === 1) lo = k;
        else if (vs[k] === N) hi = k;
      }
      const a = Math.min(lo, hi), b = Math.max(lo, hi);
      let s = 0;
      for (let k = a + 1; k < b; k++) s += vs[k];
      return s;
    }
    /* Sky/sandwich are meaningful only on rectangular grids without holes;
       on irregular grids we skip these checks. */
    const hasHoles = anyHole(deleted);
    function skyOK(r, c, v) {
      if (hasHoles) return true;
      const row = new Array(nCols), col = new Array(nRows);
      let rowFull = true, colFull = true;
      for (let k = 0; k < nCols; k++) {
        row[k] = k === c ? v : grid[r*nCols+k];
        if (!row[k]) rowFull = false;
      }
      for (let k = 0; k < nRows; k++) {
        col[k] = k === r ? v : grid[k*nCols+c];
        if (!col[k]) colFull = false;
      }
      if (rowFull) {
        if (sky.left  && sky.left[r]  && skySeen(row)                !== sky.left[r])  return false;
        if (sky.right && sky.right[r] && skySeen(row.slice().reverse()) !== sky.right[r]) return false;
        if (sandwich.left  && sandwich.left[r]  && sandwichBetween(row)                !== sandwich.left[r])  return false;
        if (sandwich.right && sandwich.right[r] && sandwichBetween(row.slice().reverse()) !== sandwich.right[r]) return false;
      }
      if (colFull) {
        if (sky.top    && sky.top[c]    && skySeen(col)                !== sky.top[c])    return false;
        if (sky.bottom && sky.bottom[c] && skySeen(col.slice().reverse()) !== sky.bottom[c]) return false;
        if (sandwich.top    && sandwich.top[c]    && sandwichBetween(col)                !== sandwich.top[c])    return false;
        if (sandwich.bottom && sandwich.bottom[c] && sandwichBetween(col.slice().reverse()) !== sandwich.bottom[c]) return false;
      }
      return true;
    }

    function candidates(i) {
      const r = (i / nCols) | 0, c = i % nCols;
      const rg = regions[i];
      let used = rowM[r] | colM[c] | (rg >= 0 ? boxM[rg] : 0);
      if (flags.diagonal && isSquare) {
        if (onDiag1(r,c)) used |= d1;
        if (onDiag2(r,c)) used |= d2;
      }
      if (flags.antiKnight) {
        forEachOffset(r, c, nRows, nCols, KNIGHT_D, j => { if (!deleted[j] && grid[j]) used |= bit(grid[j]); });
      }
      if (flags.antiKing) {
        forEachOffset(r, c, nRows, nCols, KING_D, j => { if (!deleted[j] && grid[j]) used |= bit(grid[j]); });
      }
      if (flags.antiConsecutive) {
        forEachOffset(r, c, nRows, nCols, [[-1,0],[1,0],[0,-1],[0,1]], j => {
          if (deleted[j]) return;
          const gv = grid[j]; if (!gv) return;
          if (gv > 1) used |= bit(gv - 1);
          if (gv < N) used |= bit(gv + 1);
        });
      }
      const ci = cageOf[i];
      if (ci >= 0) used |= cageMask[ci];
      /* Whisper: exclude any v within (wMin-1) of a filled neighbor. */
      for (const nb of whisperNbrs[i]) {
        const gv = grid[nb]; if (!gv) continue;
        const lo = Math.max(1, gv - (wMin - 1));
        const hi = Math.min(N, gv + (wMin - 1));
        for (let x = lo; x <= hi; x++) used |= bit(x);
      }
      /* Kropki: exclude values that don't satisfy each filled partner's rule. */
      for (const { other, kind } of kropkiNbrs[i]) {
        const gv = grid[other]; if (!gv) continue;
        if (kind === 'w') {
          let ok = 0;
          if (gv - 1 >= 1) ok |= bit(gv - 1);
          if (gv + 1 <= N) ok |= bit(gv + 1);
          used |= (~ok) & full;
        } else {
          let ok = 0;
          if (2 * gv <= N) ok |= bit(2 * gv);
          if ((gv & 1) === 0) ok |= bit(gv >> 1);
          used |= (~ok) & full;
        }
      }
      /* Compare: exclude values that violate the relation with a filled peer. */
      for (const { other, rel } of compareNbrs[i]) {
        const gv = grid[other]; if (!gv) continue;
        if (rel === 'lt') {
          for (let x = gv; x <= N; x++) used |= bit(x);      /* must be < gv */
        } else {
          for (let x = 1; x <= gv; x++) used |= bit(x);      /* must be > gv */
        }
      }
      /* XV: exclude values that don't sum to the target with a filled peer. */
      for (const { other, target } of xvNbrs[i]) {
        const gv = grid[other]; if (!gv) continue;
        const need = target - gv;
        let ok = 0;
        if (need >= 1 && need <= N) ok |= bit(need);
        used |= (~ok) & full;
      }
      /* Parity: exclude wrong-parity values. */
      used |= parityMask[i];
      /* Rainbow: if this cell is colored, forbid every digit that already
         claims this color anywhere else in the grid. */
      if (rainbow[i]) {
        const cb = 1 << (rainbow[i] - 1);
        for (let v = 1; v <= N; v++) {
          if (digitColorMask[v] & cb) used |= bit(v);
        }
      }
      /* Modular: within any 3-window, no residue mod 3 may repeat. */
      for (const trio of modWindows[i]) {
        let mask = 0;
        for (const o of trio) {
          if (o === i) continue;
          const gv = grid[o]; if (!gv) continue;
          const rv = gv % 3;
          for (let v = 1; v <= N; v++) if ((v % 3) === rv) mask |= bit(v);
        }
        used |= mask;
      }
      /* Thermo strict-monotone pruning. */
      for (const [ti, pos] of thermoAt[i]) {
        const t = thermos[ti], arr = thermoValues[ti];
        let lo = pos, hi = (t.length - 1) - pos;  /* min = pos+1, max = N - hi */
        /* If earlier value known, min is that+1; propagate through path length. */
        for (let k = pos - 1; k >= 0; k--) if (arr[k]) { lo = pos - k + (arr[k] - 1); break; }
        for (let k = pos + 1; k < t.length; k++) if (arr[k]) { hi = k - pos + (N - arr[k]); break; }
        const minV = lo + 1, maxV = N - hi;
        for (let v = 1; v < minV; v++) used |= bit(v);
        for (let v = maxV + 1; v <= N; v++) used |= bit(v);
      }
      /* Plugin-managed constraints: each may widen the `used` mask. */
      for (const { plugin, handle } of activePlugins) {
        if (plugin.solverForbid) used = plugin.solverForbid(p, pluginCtx, handle, i, used);
      }
      return (~used) & full;
    }

    /* Spectradoku: whenever the user has painted at least one color, we
       treat the coloring as a second sudoku layer and, after completing
       the digit grid, derive a valid color for every uncolored cell.
       The coloring must satisfy:
         - row / column / region uniqueness (each holds all N colors)
         - digit-class uniqueness (the N cells sharing a digit hold N
           distinct colors, i.e. every (digit, color) pair is unique)
       If the digit grid can't be extended to a valid coloring, the
       whole solution is rejected — that keeps the pair-uniqueness rule
       enforced globally, not just where the user painted. */
    const spectradokuActive = Array.prototype.some.call(rainbow, v => !!v);
    function solveColorPartition(digitsArr) {
      const totalC = nRows * nCols;
      const cols = new Int8Array(totalC);
      for (let i = 0; i < totalC; i++) cols[i] = rainbow[i];
      const rM = new Int32Array(nRows);
      const cM = new Int32Array(nCols);
      const bM = new Int32Array(regionCount);
      const dM = new Int32Array(N + 1);
      /* Seed with user-painted colors; reject inconsistent input. */
      for (let i = 0; i < totalC; i++) {
        if (deleted[i]) continue;
        const co = cols[i]; if (!co) continue;
        const r = (i / nCols) | 0, c = i % nCols, b = regions[i], cb = bit(co);
        if (rM[r] & cb) return null;
        if (cM[c] & cb) return null;
        if (b >= 0 && bM[b] & cb) return null;
        const d = digitsArr[i];
        if (d && (dM[d] & cb)) return null;
        rM[r] |= cb; cM[c] |= cb;
        if (b >= 0) bM[b] |= cb;
        if (d) dM[d] |= cb;
      }
      function cands(i) {
        const r = (i / nCols) | 0, c = i % nCols, b = regions[i], d = digitsArr[i];
        const used = rM[r] | cM[c] | (b >= 0 ? bM[b] : 0) | (d ? dM[d] : 0);
        return (~used) & full;
      }
      function search() {
        let best = -1, bestCnt = N + 1, bestMask = 0;
        for (let i = 0; i < totalC; i++) {
          if (deleted[i]) continue;
          if (cols[i]) continue;
          const m = cands(i);
          const cnt = pop(m);
          if (cnt === 0) return false;
          if (cnt < bestCnt) { bestCnt = cnt; best = i; bestMask = m; if (cnt === 1) break; }
        }
        if (best === -1) return true;
        const r = (best / nCols) | 0, c = best % nCols, b = regions[best], d = digitsArr[best];
        let m = bestMask;
        while (m) {
          const cb = m & -m;
          const co = Math.log2(cb) + 1;
          cols[best] = co;
          rM[r] |= cb; cM[c] |= cb;
          if (b >= 0) bM[b] |= cb;
          if (d) dM[d] |= cb;
          if (search()) return true;
          cols[best] = 0;
          rM[r] &= ~cb; cM[c] &= ~cb;
          if (b >= 0) bM[b] &= ~cb;
          if (d) dM[d] &= ~cb;
          m &= m - 1;
        }
        return false;
      }
      return search() ? cols : null;
    }

    const solutions = [];
    let reachedCap = false;

    function backtrack() {
      if (reachedCap) return;
      let best = -1, bestCnt = N + 1, bestMask = 0;
      for (let i = 0; i < total; i++) {
        if (deleted[i]) continue;
        if (grid[i]) continue;
        const m = candidates(i);
        const cnt = pop(m);
        if (cnt === 0) return;
        if (cnt < bestCnt) { bestCnt = cnt; best = i; bestMask = m; if (cnt === 1) break; }
      }
      if (best === -1) {
        /* Full grid. Skyscraper/Sandwich full-line checks already enforced
           along the way, but verify to be safe. Only meaningful on
           hole-free rectangles. */
        if (!hasHoles) {
          for (let r = 0; r < nRows; r++) {
            const row = [];
            for (let k = 0; k < nCols; k++) row.push(grid[r*nCols+k]);
            if (sky.left  && sky.left[r]  && skySeen(row)                !== sky.left[r])  return;
            if (sky.right && sky.right[r] && skySeen(row.slice().reverse()) !== sky.right[r]) return;
            if (sandwich.left  && sandwich.left[r]  && sandwichBetween(row) !== sandwich.left[r])  return;
            if (sandwich.right && sandwich.right[r] && sandwichBetween(row.slice().reverse()) !== sandwich.right[r]) return;
          }
          for (let c = 0; c < nCols; c++) {
            const col = [];
            for (let k = 0; k < nRows; k++) col.push(grid[k*nCols+c]);
            if (sky.top    && sky.top[c]    && skySeen(col)                !== sky.top[c])    return;
            if (sky.bottom && sky.bottom[c] && skySeen(col.slice().reverse()) !== sky.bottom[c]) return;
            if (sandwich.top    && sandwich.top[c]    && sandwichBetween(col) !== sandwich.top[c])    return;
            if (sandwich.bottom && sandwich.bottom[c] && sandwichBetween(col.slice().reverse()) !== sandwich.bottom[c]) return;
          }
        }
        if (solutions.length >= SOL_CAP) { reachedCap = true; return; }
        const digitSnap = Uint8Array.from(grid);
        let colorSnap = null;
        if (spectradokuActive) {
          colorSnap = solveColorPartition(digitSnap);
          /* Digit grid that can't be extended to a valid coloring is
             not a Spectradoku solution — skip it. */
          if (!colorSnap) return;
        }
        solutions.push({ values: digitSnap, colors: colorSnap });
        return;
      }
      const r = (best / nCols) | 0, c = best % nCols;
      let m = bestMask;
      while (m && !reachedCap) {
        const b = m & -m;
        const v = Math.log2(b) + 1;
        if (skyOK(r, c, v) && place(best, v)) {
          backtrack();
          unplace(best, v);
        }
        m &= m - 1;
      }
    }

    backtrack();
    return { solutions, reachedCap };
  }

  /* ---------- Serialize / deserialize (for load/share buttons) ----------
   * The output is designed to compress well: zero-filled arrays, empty
   * lists, unchanged region layouts, and all-false flag objects are dropped
   * entirely rather than dumping thousands of zeros into the JSON. The
   * deserializer treats every field as optional and reconstructs defaults
   * for anything missing. */
  function anyNonzero(arr) { for (let i = 0; i < arr.length; i++) if (arr[i]) return true; return false; }
  function equalRegions(a, b) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
    return true;
  }
  function compactSides(sides) {
    /* sky/sandwich/xsum each hold four N-long arrays. Emit only the sides
       that have any nonzero clue; return null if none of them do. */
    const out = {};
    for (const side of ['top', 'bottom', 'left', 'right']) {
      if (sides[side] && anyNonzero(sides[side])) out[side] = [...sides[side]];
    }
    return Object.keys(out).length ? out : null;
  }
  function compactFlags(flags) {
    const out = {};
    for (const k of Object.keys(flags || {})) if (flags[k]) out[k] = true;
    return Object.keys(out).length ? out : null;
  }
  function serialize(p) {
    const out = { N: p.N, boxR: p.boxR, boxC: p.boxC };
    const nRows = p.rows != null ? p.rows : p.N;
    const nCols = p.cols != null ? p.cols : p.N;
    const digits = p.digits != null ? p.digits : p.N;
    /* Emit shape only when it deviates from the classic N×N default. */
    if (nRows !== p.N) out.rows = nRows;
    if (nCols !== p.N) out.cols = nCols;
    if (digits !== defaultDigits(nRows, nCols)) out.digits = digits;
    if (p.deleted) {
      const del = [];
      for (let i = 0; i < p.deleted.length; i++) if (p.deleted[i]) del.push(i);
      if (del.length) out.deleted = del;
    }
    if (anyNonzero(p.values)) out.values = [...p.values];
    if (anyNonzero(p.given))  out.given  = [...p.given];
    const defRegions = rectRegions(nRows, nCols, p.boxR, p.boxC);
    /* Mark deleted cells' region as -1 in the default so comparison ignores them. */
    if (p.deleted) for (let i = 0; i < defRegions.length; i++) if (p.deleted[i]) defRegions[i] = -1;
    if (!equalRegions(p.regions, defRegions)) out.regions = [...p.regions];
    if (p.cages && p.cages.length)       out.cages   = p.cages;
    if (p.thermos && p.thermos.length)   out.thermos = p.thermos;
    if (p.whispers   && p.whispers.length)   out.whispers   = p.whispers;
    if (p.regionSums && p.regionSums.length) out.regionSums = p.regionSums;
    if (p.modulars   && p.modulars.length)   out.modulars   = p.modulars;
    if (p.kropki   && p.kropki.length)   out.kropki  = p.kropki;
    if (p.compare  && p.compare.length)  out.compare = p.compare;
    if (p.xv       && p.xv.length)       out.xv      = p.xv;
    if (p.parity   && anyNonzero(p.parity))   out.parity  = [...p.parity];
    if (p.rainbow  && anyNonzero(p.rainbow))  out.rainbow = [...p.rainbow];
    const sky      = compactSides(p.sky);      if (sky)      out.sky      = sky;
    const sandwich = compactSides(p.sandwich); if (sandwich) out.sandwich = sandwich;
    const flags = compactFlags(p.flags); if (flags) out.flags = flags;
    /* Plugin fields: strip empty arrays / all-zero cell-masks after the
       plugin emits its chunk so each plugin's serialize() stays simple. */
    for (const plugin of pluginList()) {
      if (!plugin.serialize) continue;
      const chunk = plugin.serialize(p);
      for (const k of Object.keys(chunk)) {
        const v = chunk[k];
        if (v == null) continue;
        if (Array.isArray(v)) {
          if (v.length === 0) continue;
          if (v.every(x => x === 0)) continue;
          out[k] = v;
        } else if (typeof v === 'object') {
          const sub = compactSides(v);
          if (sub) out[k] = sub;
        } else if (v) {
          out[k] = v;
        }
      }
    }
    return JSON.stringify(out);
  }
  function deserialize(s) {
    const j = typeof s === 'string' ? JSON.parse(s) : s;
    const rows   = j.rows   != null ? j.rows   : j.N;
    const cols   = j.cols   != null ? j.cols   : j.N;
    const digits = j.digits != null ? j.digits : defaultDigits(rows, cols);
    const total  = rows * cols;
    const deletedArr = new Uint8Array(total);
    if (Array.isArray(j.deleted)) for (const i of j.deleted) if (i >= 0 && i < total) deletedArr[i] = 1;
    const p = newPuzzle(digits, j.boxR, j.boxC, { rows, cols, digits, deleted: deletedArr });
    if (j.values && j.values.length === total) p.values.set(j.values);
    if (j.given  && j.given.length  === total) p.given.set(j.given);
    if (j.regions && j.regions.length === total) p.regions = Int8Array.from(j.regions);
    p.cages   = (j.cages || []).map(c => ({ cells:[...c.cells], sum: c.sum ?? null }));
    p.thermos = (j.thermos || []).map(t => [...t]);
    p.whispers   = (j.whispers   || []).map(t => [...t]);
    p.regionSums = (j.regionSums || []).map(t => [...t]);
    p.modulars   = (j.modulars   || []).map(t => [...t]);
    p.kropki     = (j.kropki || []).map(d => ({ a: d.a, b: d.b, kind: d.kind }));
    p.compare    = (j.compare || []).map(d => ({ a: d.a, b: d.b, kind: d.kind }));
    p.xv         = (j.xv || []).map(d => ({ a: d.a, b: d.b, kind: d.kind }));
    if (j.parity && j.parity.length === total) p.parity.set(j.parity);
    /* Side arrays are cols-sized on top/bottom and rows-sized on left/right;
       accept legacy N-sized arrays too by falling back to what we have. */
    function setSides(target, src) {
      if (!src) return;
      const copy = (dst, arr) => { if (!arr) return; const n = Math.min(dst.length, arr.length); for (let k = 0; k < n; k++) dst[k] = arr[k]; };
      copy(target.top,    src.top);
      copy(target.bottom, src.bottom);
      copy(target.left,   src.left);
      copy(target.right,  src.right);
    }
    setSides(p.sky,      j.sky);
    setSides(p.sandwich, j.sandwich);
    if (j.rainbow && j.rainbow.length === total) p.rainbow.set(j.rainbow);
    for (const plugin of pluginList()) {
      if (plugin.deserialize) plugin.deserialize(p, j);
    }
    if (j.flags) Object.assign(p.flags, j.flags);
    return p;
  }

  return {
    MIN_N, MAX_N, CHARS,
    digitToChar, charToDigit, isDigitKey,
    rectRegions, regionsValid, defaultDigits,
    newPuzzle, resize, whisperMin,
    findConflicts, findSolutions,
    serialize, deserialize,
  };
})();
