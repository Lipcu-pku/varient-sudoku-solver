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

  /* Rectangular-box region index. */
  function rectRegions(N, boxR, boxC) {
    const boxesPerRow = N / boxC;
    const out = new Int8Array(N * N);
    for (let i = 0; i < N * N; i++) {
      const r = (i / N) | 0, c = i % N;
      out[i] = Math.floor(r / boxR) * boxesPerRow + Math.floor(c / boxC);
    }
    return out;
  }

  function newPuzzle(N, boxR, boxC) {
    const p = {
      N, boxR, boxC,
      values:  new Uint8Array(N * N),
      given:   new Uint8Array(N * N),
      regions: rectRegions(N, boxR, boxC),
      cages:   [],
      thermos: [],
      whispers:   [],
      regionSums: [],
      modulars:   [],
      kropki:     [],
      compare:    [],
      xv:         [],
      parity:   new Int8Array(N * N),
      sky:      { top: new Uint8Array(N), bottom: new Uint8Array(N),
                  left: new Uint8Array(N), right: new Uint8Array(N) },
      sandwich: { top: new Uint8Array(N), bottom: new Uint8Array(N),
                  left: new Uint8Array(N), right: new Uint8Array(N) },
      rainbow:  new Int8Array(N * N),
      flags:   { diagonal:false, antiKnight:false, antiKing:false, antiConsecutive:false, disjoint:false },
    };
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
  function forEachOffset(r, c, N, offsets, fn) {
    for (const [dr, dc] of offsets) {
      const nr = r + dr, nc = c + dc;
      if (nr >= 0 && nr < N && nc >= 0 && nc < N) fn(nr * N + nc);
    }
  }

  /* ---------- Conflict scan (all defined constraints) ---------- */
  function findConflicts(p) {
    const { N, values, regions, cages, thermos, sky, flags } = p;
    const whispers   = p.whispers   || [];
    const regionSums = p.regionSums || [];
    const modulars   = p.modulars   || [];
    const kropki     = p.kropki     || [];
    const compare    = p.compare    || [];
    const xv         = p.xv         || [];
    const parity     = p.parity     || new Int8Array(N * N);
    const sandwich   = p.sandwich   || { top:new Uint8Array(N), bottom:new Uint8Array(N),
                                         left:new Uint8Array(N), right:new Uint8Array(N) };
    const rainbow    = p.rainbow    || new Int8Array(N * N);
    const wMin = whisperMin(N);
    const conflicts = new Set();
    const rows  = Array.from({ length: N }, () => new Map());
    const cols  = Array.from({ length: N }, () => new Map());
    const boxes = Array.from({ length: N }, () => new Map());
    const diag1 = new Map(), diag2 = new Map();

    function clash(a, b) { conflicts.add(a); conflicts.add(b); }
    function put(map, key, i) {
      if (map.has(key)) clash(map.get(key), i);
      else map.set(key, i);
    }

    for (let i = 0; i < N * N; i++) {
      const v = values[i]; if (!v) continue;
      const r = (i / N) | 0, c = i % N;
      put(rows[r],  v, i);
      put(cols[c],  v, i);
      put(boxes[regions[i]], v, i);
      if (flags.diagonal) {
        if (r === c)         put(diag1, v, i);
        if (r + c === N - 1) put(diag2, v, i);
      }
    }

    if (flags.antiKnight || flags.antiKing || flags.antiConsecutive) {
      for (let i = 0; i < N * N; i++) {
        const v = values[i]; if (!v) continue;
        const r = (i / N) | 0, c = i % N;
        if (flags.antiKnight) {
          forEachOffset(r, c, N, KNIGHT_D, j => { if (values[j] === v) clash(i, j); });
        }
        if (flags.antiKing) {
          forEachOffset(r, c, N, KING_D, j => { if (values[j] === v) clash(i, j); });
        }
        if (flags.antiConsecutive) {
          forEachOffset(r, c, N, [[-1,0],[1,0],[0,-1],[0,1]], j => {
            if (values[j] && Math.abs(values[j] - v) === 1) clash(i, j);
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
    for (let r = 0; r < N; r++) {
      const row = [], rowRev = [];
      for (let c = 0; c < N; c++) { row.push(r*N+c); rowRev.push(r*N+(N-1-c)); }
      checkSky(row,    sky.left[r],  () => row.forEach(i => conflicts.add(i)));
      checkSky(rowRev, sky.right[r], () => rowRev.forEach(i => conflicts.add(i)));
    }
    for (let c = 0; c < N; c++) {
      const col = [], colRev = [];
      for (let r = 0; r < N; r++) { col.push(r*N+c); colRev.push((N-1-r)*N+c); }
      checkSky(col,    sky.top[c],    () => col.forEach(i => conflicts.add(i)));
      checkSky(colRev, sky.bottom[c], () => colRev.forEach(i => conflicts.add(i)));
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
    for (let i = 0; i < N * N; i++) {
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
    for (let r = 0; r < N; r++) {
      const row = [], rowRev = [];
      for (let c = 0; c < N; c++) { row.push(r*N+c); rowRev.push(r*N+(N-1-c)); }
      checkSandwich(row,    sandwich.left[r],  () => row.forEach(i => conflicts.add(i)));
      checkSandwich(rowRev, sandwich.right[r], () => rowRev.forEach(i => conflicts.add(i)));
    }
    for (let c = 0; c < N; c++) {
      const col = [], colRev = [];
      for (let r = 0; r < N; r++) { col.push(r*N+c); colRev.push((N-1-r)*N+c); }
      checkSandwich(col,    sandwich.top[c],    () => col.forEach(i => conflicts.add(i)));
      checkSandwich(colRev, sandwich.bottom[c], () => colRev.forEach(i => conflicts.add(i)));
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
  function regionsValid(regions, N) {
    const counts = new Int32Array(N);
    for (let i = 0; i < N * N; i++) {
      const r = regions[i];
      if (r < 0 || r >= N) return false;
      counts[r]++;
    }
    for (let r = 0; r < N; r++) if (counts[r] !== N) return false;
    return true;
  }

  /* ---------- Solver ---------- */
  const SOL_CAP = 200;

  function findSolutions(p) {
    const { N, values, regions, cages, thermos, sky, flags } = p;
    const whispers   = p.whispers   || [];
    const regionSums = p.regionSums || [];
    const modulars   = p.modulars   || [];
    const kropki     = p.kropki     || [];
    const compare    = p.compare    || [];
    const xv         = p.xv         || [];
    const parity     = p.parity     || new Int8Array(N * N);
    const sandwich   = p.sandwich   || { top:new Uint8Array(N), bottom:new Uint8Array(N),
                                         left:new Uint8Array(N), right:new Uint8Array(N) };
    const rainbow    = p.rainbow    || new Int8Array(N * N);
    const wMin = whisperMin(N);
    if (!regionsValid(regions, N)) return { solutions: [], reachedCap: false, invalidRegions: true };

    /* Rainbow partition pre-check: each row/col/box may hold each non-zero
       color at most once. This depends only on the coloring, not on digits,
       so if it fails there is no solution regardless of placement. */
    {
      const rowC = Array.from({ length: N }, () => new Set());
      const colC = Array.from({ length: N }, () => new Set());
      const boxC = Array.from({ length: N }, () => new Set());
      for (let i = 0; i < N * N; i++) {
        const rb = rainbow[i]; if (!rb) continue;
        const r = (i / N) | 0, c = i % N;
        if (rowC[r].has(rb) || colC[c].has(rb) || boxC[regions[i]].has(rb)) {
          return { solutions: [], reachedCap: false };
        }
        rowC[r].add(rb); colC[c].add(rb); boxC[regions[i]].add(rb);
      }
    }

    const full = (1 << N) - 1;
    const rowM = new Array(N).fill(0);
    const colM = new Array(N).fill(0);
    const boxM = new Array(N).fill(0);
    let d1 = 0, d2 = 0;
    const grid = new Uint8Array(N * N);

    /* Cage bookkeeping */
    const cageOf = new Array(N * N).fill(-1);
    cages.forEach((cage, ci) => { for (const i of cage.cells) cageOf[i] = ci; });
    const cageMask = new Int32Array(cages.length);
    const cageSum  = new Int32Array(cages.length);
    const cageFill = new Int32Array(cages.length);

    /* Thermo lookup: for each cell, list of (thermoIdx, positionOnPath). */
    const thermoAt = Array.from({ length: N * N }, () => []);
    thermos.forEach((t, ti) => t.forEach((i, pos) => thermoAt[i].push([ti, pos])));
    const thermoValues = thermos.map(t => new Uint8Array(t.length));

    /* Whisper lookup: adjacency pairs by cell (undirected). */
    const whisperNbrs = Array.from({ length: N * N }, () => []);
    for (const line of whispers) {
      for (let k = 1; k < line.length; k++) {
        whisperNbrs[line[k-1]].push(line[k]);
        whisperNbrs[line[k]].push(line[k-1]);
      }
    }

    /* Modular lookup: for each cell, all sliding 3-windows it belongs to. */
    const modWindows = Array.from({ length: N * N }, () => []);
    for (const line of modulars) {
      for (let k = 0; k + 2 < line.length; k++) {
        const trio = [line[k], line[k+1], line[k+2]];
        for (const c of trio) modWindows[c].push(trio);
      }
    }

    /* Kropki lookup: for each cell, list of { other, kind }. */
    const kropkiNbrs = Array.from({ length: N * N }, () => []);
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
    const compareNbrs = Array.from({ length: N * N }, () => []);
    for (const d of compare) {
      compareNbrs[d.a].push({ other: d.b, rel: d.kind });
      compareNbrs[d.b].push({ other: d.a, rel: d.kind === 'lt' ? 'gt' : 'lt' });
    }

    /* XV lookup: for each cell, list of { other, target } (10 for X, 5 for V). */
    const xvNbrs = Array.from({ length: N * N }, () => []);
    for (const d of xv) {
      const target = d.kind === 'x' ? 10 : 5;
      xvNbrs[d.a].push({ other: d.b, target });
      xvNbrs[d.b].push({ other: d.a, target });
    }

    /* Parity per-cell forbidden mask. Cell with parity=1 (odd) must reject
       even values, and vice versa. Precompute once. */
    const oddForbidden  = ((v) => { let m = 0; for (let x = 2; x <= v; x += 2) m |= 1 << (x-1); return m; })(N);
    const evenForbidden = ((v) => { let m = 0; for (let x = 1; x <= v; x += 2) m |= 1 << (x-1); return m; })(N);
    const parityMask = new Int32Array(N * N);
    for (let i = 0; i < N * N; i++) {
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
    const rsSegOf = Array.from({ length: N * N }, () => []);
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
    function onDiag1(r, c) { return r === c; }
    function onDiag2(r, c) { return r + c === N - 1; }

    /* Check-then-commit: verify every constraint, then mutate state. */
    function place(i, v) {
      const r = (i / N) | 0, c = i % N, b = regions[i], mb = bit(v);
      if (rowM[r] & mb) return false;
      if (colM[c] & mb) return false;
      if (boxM[b] & mb) return false;
      if (flags.diagonal) {
        if (onDiag1(r,c) && (d1 & mb)) return false;
        if (onDiag2(r,c) && (d2 & mb)) return false;
      }
      if (flags.antiKnight) {
        let bad = false;
        forEachOffset(r, c, N, KNIGHT_D, j => { if (grid[j] === v) bad = true; });
        if (bad) return false;
      }
      if (flags.antiKing) {
        let bad = false;
        forEachOffset(r, c, N, KING_D, j => { if (grid[j] === v) bad = true; });
        if (bad) return false;
      }
      if (flags.antiConsecutive) {
        let bad = false;
        forEachOffset(r, c, N, [[-1,0],[1,0],[0,-1],[0,1]], j => {
          if (grid[j] && Math.abs(grid[j] - v) === 1) bad = true;
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
      rowM[r] |= mb; colM[c] |= mb; boxM[b] |= mb;
      if (flags.diagonal) {
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
      const r = (i / N) | 0, c = i % N, b = regions[i], mb = bit(v);
      grid[i] = 0;
      rowM[r] &= ~mb; colM[c] &= ~mb; boxM[b] &= ~mb;
      if (flags.diagonal) {
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
    pluginCtx = { N, regions, grid, bit, pop, full };
    activePlugins = [];
    for (const plugin of pluginList()) {
      if (!plugin.solverInit) continue;
      const handle = plugin.solverInit(p, pluginCtx);
      if (handle) activePlugins.push({ plugin, handle });
    }

    /* Seed the initial state; reject inconsistent givens up front. */
    for (let i = 0; i < N * N; i++) {
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
    function skyOK(r, c, v) {
      /* only trigger when this placement completes a line. */
      const row = new Array(N), col = new Array(N);
      let rowFull = true, colFull = true;
      for (let k = 0; k < N; k++) {
        row[k] = k === c ? v : grid[r*N+k];
        col[k] = k === r ? v : grid[k*N+c];
        if (!row[k]) rowFull = false;
        if (!col[k]) colFull = false;
      }
      if (rowFull) {
        if (sky.left[r]  && skySeen(row)                !== sky.left[r])  return false;
        if (sky.right[r] && skySeen(row.slice().reverse()) !== sky.right[r]) return false;
        if (sandwich.left[r]  && sandwichBetween(row)                !== sandwich.left[r])  return false;
        if (sandwich.right[r] && sandwichBetween(row.slice().reverse()) !== sandwich.right[r]) return false;
      }
      if (colFull) {
        if (sky.top[c]    && skySeen(col)                !== sky.top[c])    return false;
        if (sky.bottom[c] && skySeen(col.slice().reverse()) !== sky.bottom[c]) return false;
        if (sandwich.top[c]    && sandwichBetween(col)                !== sandwich.top[c])    return false;
        if (sandwich.bottom[c] && sandwichBetween(col.slice().reverse()) !== sandwich.bottom[c]) return false;
      }
      return true;
    }

    function candidates(i) {
      const r = (i / N) | 0, c = i % N;
      let used = rowM[r] | colM[c] | boxM[regions[i]];
      if (flags.diagonal) {
        if (onDiag1(r,c)) used |= d1;
        if (onDiag2(r,c)) used |= d2;
      }
      if (flags.antiKnight) {
        forEachOffset(r, c, N, KNIGHT_D, j => { if (grid[j]) used |= bit(grid[j]); });
      }
      if (flags.antiKing) {
        forEachOffset(r, c, N, KING_D, j => { if (grid[j]) used |= bit(grid[j]); });
      }
      if (flags.antiConsecutive) {
        forEachOffset(r, c, N, [[-1,0],[1,0],[0,-1],[0,1]], j => {
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
    function solveColorPartition(digits) {
      const total = N * N;
      const cols = new Int8Array(total);
      for (let i = 0; i < total; i++) cols[i] = rainbow[i];
      const rM = new Int32Array(N);
      const cM = new Int32Array(N);
      const bM = new Int32Array(N);
      const dM = new Int32Array(N + 1);
      /* Seed with user-painted colors; reject inconsistent input. */
      for (let i = 0; i < total; i++) {
        const co = cols[i]; if (!co) continue;
        const r = (i / N) | 0, c = i % N, b = regions[i], cb = bit(co);
        if (rM[r] & cb) return null;
        if (cM[c] & cb) return null;
        if (bM[b] & cb) return null;
        const d = digits[i];
        if (d && (dM[d] & cb)) return null;
        rM[r] |= cb; cM[c] |= cb; bM[b] |= cb;
        if (d) dM[d] |= cb;
      }
      function cands(i) {
        const r = (i / N) | 0, c = i % N, b = regions[i], d = digits[i];
        const used = rM[r] | cM[c] | bM[b] | (d ? dM[d] : 0);
        return (~used) & full;
      }
      function search() {
        let best = -1, bestCnt = N + 1, bestMask = 0;
        for (let i = 0; i < total; i++) {
          if (cols[i]) continue;
          const m = cands(i);
          const cnt = pop(m);
          if (cnt === 0) return false;
          if (cnt < bestCnt) { bestCnt = cnt; best = i; bestMask = m; if (cnt === 1) break; }
        }
        if (best === -1) return true;
        const r = (best / N) | 0, c = best % N, b = regions[best], d = digits[best];
        let m = bestMask;
        while (m) {
          const cb = m & -m;
          const co = Math.log2(cb) + 1;
          cols[best] = co;
          rM[r] |= cb; cM[c] |= cb; bM[b] |= cb;
          if (d) dM[d] |= cb;
          if (search()) return true;
          cols[best] = 0;
          rM[r] &= ~cb; cM[c] &= ~cb; bM[b] &= ~cb;
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
      for (let i = 0; i < N * N; i++) {
        if (grid[i]) continue;
        const m = candidates(i);
        const cnt = pop(m);
        if (cnt === 0) return;
        if (cnt < bestCnt) { bestCnt = cnt; best = i; bestMask = m; if (cnt === 1) break; }
      }
      if (best === -1) {
        /* Full grid. Skyscraper/Sandwich full-line checks already enforced
           along the way, but verify to be safe. */
        for (let r = 0; r < N; r++) {
          const row = [], col = [];
          for (let k = 0; k < N; k++) { row.push(grid[r*N+k]); col.push(grid[k*N+r]); }
          if (sky.left[r]  && skySeen(row)                !== sky.left[r])  return;
          if (sky.right[r] && skySeen(row.slice().reverse()) !== sky.right[r]) return;
          if (sky.top[r]    && skySeen(col)                !== sky.top[r])    return;
          if (sky.bottom[r] && skySeen(col.slice().reverse()) !== sky.bottom[r]) return;
          if (sandwich.left[r]  && sandwichBetween(row) !== sandwich.left[r])  return;
          if (sandwich.right[r] && sandwichBetween(row) !== sandwich.right[r]) return;
          if (sandwich.top[r]    && sandwichBetween(col) !== sandwich.top[r])    return;
          if (sandwich.bottom[r] && sandwichBetween(col) !== sandwich.bottom[r]) return;
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
      const r = (best / N) | 0, c = best % N;
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

  /* ---------- Serialize / deserialize (for load/share buttons) ---------- */
  function serialize(p) {
    const out = {
      N: p.N, boxR: p.boxR, boxC: p.boxC,
      values: [...p.values], given: [...p.given], regions: [...p.regions],
      cages: p.cages, thermos: p.thermos,
      whispers: p.whispers, regionSums: p.regionSums, modulars: p.modulars,
      kropki: p.kropki, compare: p.compare, xv: p.xv,
      parity: [...(p.parity || [])],
      sky: { top:[...p.sky.top], bottom:[...p.sky.bottom],
             left:[...p.sky.left], right:[...p.sky.right] },
      sandwich: { top:[...p.sandwich.top], bottom:[...p.sandwich.bottom],
                  left:[...p.sandwich.left], right:[...p.sandwich.right] },
      rainbow: [...(p.rainbow || [])],
      flags: p.flags,
    };
    for (const plugin of pluginList()) {
      if (plugin.serialize) Object.assign(out, plugin.serialize(p));
    }
    return JSON.stringify(out);
  }
  function deserialize(s) {
    const j = typeof s === 'string' ? JSON.parse(s) : s;
    const p = newPuzzle(j.N, j.boxR, j.boxC);
    p.values.set(j.values || []);
    p.given.set(j.given || []);
    if (j.regions && j.regions.length === j.N * j.N) p.regions = Int8Array.from(j.regions);
    p.cages   = (j.cages || []).map(c => ({ cells:[...c.cells], sum: c.sum ?? null }));
    p.thermos = (j.thermos || []).map(t => [...t]);
    p.whispers   = (j.whispers   || []).map(t => [...t]);
    p.regionSums = (j.regionSums || []).map(t => [...t]);
    p.modulars   = (j.modulars   || []).map(t => [...t]);
    p.kropki     = (j.kropki || []).map(d => ({ a: d.a, b: d.b, kind: d.kind }));
    p.compare    = (j.compare || []).map(d => ({ a: d.a, b: d.b, kind: d.kind }));
    p.xv         = (j.xv || []).map(d => ({ a: d.a, b: d.b, kind: d.kind }));
    if (j.parity && j.parity.length === j.N * j.N) p.parity.set(j.parity);
    if (j.sky) {
      p.sky.top.set(j.sky.top || []);       p.sky.bottom.set(j.sky.bottom || []);
      p.sky.left.set(j.sky.left || []);     p.sky.right.set(j.sky.right || []);
    }
    if (j.sandwich) {
      p.sandwich.top.set(j.sandwich.top || []);     p.sandwich.bottom.set(j.sandwich.bottom || []);
      p.sandwich.left.set(j.sandwich.left || []);   p.sandwich.right.set(j.sandwich.right || []);
    }
    if (j.rainbow && j.rainbow.length === j.N * j.N) p.rainbow.set(j.rainbow);
    for (const plugin of pluginList()) {
      if (plugin.deserialize) plugin.deserialize(p, j);
    }
    if (j.flags) Object.assign(p.flags, j.flags);
    return p;
  }

  return {
    MIN_N, MAX_N, CHARS,
    digitToChar, charToDigit, isDigitKey,
    rectRegions, regionsValid,
    newPuzzle, resize, whisperMin,
    findConflicts, findSolutions,
    serialize, deserialize,
  };
})();
