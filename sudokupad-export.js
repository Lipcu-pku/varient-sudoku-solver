/*
 * sudokupad-export.js — convert the internal puzzle state into an
 * f-puzzles JSON blob, LZ-compress it, and build the SudokuPad play link.
 *
 * SudokuPad accepts an f-puzzles payload via:
 *   https://sudokupad.app/?puzzleid=fpuzzles{ENCODED}
 * where ENCODED is `encodeURIComponent(LZString.compressToBase64(json))`
 * — the same handshake used by the community fpuzzles → SudokuPad
 * userscript.
 *
 * Field mapping lives in toFpuzzlesJson(). Constraints without a native
 * fpuzzles counterpart (slow thermo, lockout, sequence, parity line,
 * hitpoint, count-circle, spectradoku, index cells, compare) are either
 * rendered as decorative overlays (line / circle / text) so the visual
 * survives, or dropped entirely. The dropped constraint ids are returned
 * alongside the URL so the caller can flag them.
 */
(function () {
  const RC = (r, c) => `R${r}C${c}`;
  const idxRC = (i, N) => RC(((i / N) | 0) + 1, (i % N) + 1);
  const outerCell = (side, k, N) => {
    if (side === 'top')    return RC(0,       k + 1);
    if (side === 'bottom') return RC(N + 1,   k + 1);
    if (side === 'left')   return RC(k + 1,   0);
    return                        RC(k + 1,   N + 1);
  };
  const LK_DIR = { dr: 'DR', dl: 'DL', ur: 'UR', ul: 'UL' };

  /* Decorative palette for constraints without native fpuzzles support.
     Chosen distinct from each other and from fpuzzles' own defaults so a
     round-tripped puzzle stays visually parseable. */
  const DECO = {
    slowThermo:    '#b7b7b7',
    lockoutLine:   '#f26fa2',
    sequenceLine:  '#4CAF50',
    parityLine:    '#9C27B0',
    hitpoint:      '#607d8b',
    countCircle:   '#000000',
    indexCol:      '#009688',
    indexRow:      '#795548',
  };

  /* Duplicate of SudokuCore.rectRegions — kept local so this file can load
     even if sudoku-core.js is unavailable (unusual, but avoids the coupling). */
  function rectRegions(N, boxR, boxC) {
    const boxesPerRow = N / boxC;
    const out = new Int8Array(N * N);
    for (let i = 0; i < N * N; i++) {
      const r = (i / N) | 0, c = i % N;
      out[i] = Math.floor(r / boxR) * boxesPerRow + Math.floor(c / boxC);
    }
    return out;
  }

  /* Pick the pill (base) cell nearest to the first shaft cell — matches the
     visual "arrow attaches at the closest corner" convention that fpuzzles
     uses for multi-cell pills. */
  function nearestBaseIdx(base, pathStart, N) {
    const pr = (pathStart / N) | 0, pc = pathStart % N;
    let best = base[0], bestD = Infinity;
    for (const b of base) {
      const r = (b / N) | 0, c = b % N;
      const d = Math.abs(r - pr) + Math.abs(c - pc);
      if (d < bestD) { bestD = d; best = b; }
    }
    return best;
  }

  function toFpuzzlesJson(p) {
    const N = p.N;
    const total = N * N;
    const dropped = new Set();

    /* --- grid: values / givens / region overrides --- */
    const grid = Array.from({ length: N }, () => Array.from({ length: N }, () => ({})));
    const defRegions = rectRegions(N, p.boxR, p.boxC);
    let regionsDiverge = false;
    if (p.regions) {
      for (let i = 0; i < total; i++) {
        if (p.regions[i] !== defRegions[i]) { regionsDiverge = true; break; }
      }
    }
    for (let i = 0; i < total; i++) {
      const r = (i / N) | 0, c = i % N;
      const cell = grid[r][c];
      const v = p.values[i];
      if (v) {
        cell.value = v;
        if (p.given[i]) cell.given = true;
      }
      if (regionsDiverge) {
        /* fpuzzles wants zero-based region ids for every cell when regions
           deviate from the default. Emit for every cell so the region
           partition is fully self-contained. */
        cell.region = p.regions[i];
      }
    }

    const out = { size: N, grid };

    /* --- global flags --- */
    if (p.flags) {
      if (p.flags.diagonal) {
        out['diagonal+'] = true;
        out['diagonal-'] = true;
      }
      if (p.flags.antiKnight)      out.antiknight      = true;
      if (p.flags.antiKing)        out.antiking        = true;
      if (p.flags.antiConsecutive) out.nonconsecutive  = true;
      if (p.flags.disjoint)        out.disjointgroups  = true;
    }

    /* --- killer cages --- */
    if ((p.cages || []).length) {
      out.killercage = p.cages.map(c => {
        const entry = { cells: c.cells.map(i => idxRC(i, N)) };
        if (c.sum != null) entry.value = String(c.sum);
        return entry;
      });
    }

    /* --- thermometers --- */
    if ((p.thermos || []).length) {
      out.thermometer = p.thermos.map(t => ({
        lines: [t.map(i => idxRC(i, N))],
      }));
    }

    /* --- arrows: pill (base) + shaft (path). fpuzzles wants the shaft to
       include the pill cell it attaches to as its first element. --- */
    if ((p.arrows || []).length) {
      out.arrow = p.arrows
        .filter(a => a.base && a.base.length && a.path && a.path.length)
        .map(a => {
          const anchor = nearestBaseIdx(a.base, a.path[0], N);
          return {
            cells: a.base.map(i => idxRC(i, N)),
            lines: [[idxRC(anchor, N), ...a.path.map(i => idxRC(i, N))]],
          };
        });
    }

    /* --- native fpuzzles line families --- */
    const mapLines = (list) => list.map(l => ({ lines: [l.map(i => idxRC(i, N))] }));
    if ((p.whispers   || []).length) out.whispers      = mapLines(p.whispers);
    if ((p.regionSums || []).length) out.regionsumline = mapLines(p.regionSums);
    if ((p.modulars   || []).length) out.modularline   = mapLines(p.modulars);
    if ((p.renbans    || []).length) out.renban        = mapLines(p.renbans);
    if ((p.palindromes|| []).length) out.palindrome    = mapLines(p.palindromes);
    if ((p.entropics  || []).length) out.entropicline  = mapLines(p.entropics);
    if ((p.betweenLines || []).length) out.betweenline = mapLines(p.betweenLines);

    /* --- extra regions --- */
    if ((p.extraRegions || []).length) {
      out.extraregion = p.extraRegions.map(er => ({
        cells: er.cells.map(i => idxRC(i, N)),
      }));
    }

    /* --- quadruples: 2x2 keyed by top-left corner (r-1, c-1) --- */
    if ((p.quadruples || []).length) {
      out.quadruple = p.quadruples
        .filter(q => q.r > 0 && q.r < N && q.c > 0 && q.c < N)
        .map(q => ({
          cells: [
            RC(q.r,     q.c),
            RC(q.r,     q.c + 1),
            RC(q.r + 1, q.c),
            RC(q.r + 1, q.c + 1),
          ],
          values: [...(q.digits || [])],
        }));
    }

    /* --- odd / even parity --- */
    if (p.parity) {
      const odd = [], even = [];
      for (let i = 0; i < total; i++) {
        if (p.parity[i] === 1) odd.push({ cell: idxRC(i, N) });
        else if (p.parity[i] === 2) even.push({ cell: idxRC(i, N) });
      }
      if (odd.length)  out.odd = odd;
      if (even.length) out.even = even;
    }

    /* --- kropki --- */
    if ((p.kropki || []).length) {
      const diff = [], ratio = [];
      for (const d of p.kropki) {
        const pair = { cells: [idxRC(d.a, N), idxRC(d.b, N)] };
        if (d.kind === 'w') diff.push(pair);
        else                { pair.value = '2'; ratio.push(pair); }
      }
      if (diff.length)  out.difference = diff;
      if (ratio.length) out.ratio      = ratio;
    }

    /* --- XV --- */
    if ((p.xv || []).length) {
      out.xv = p.xv.map(d => ({
        cells: [idxRC(d.a, N), idxRC(d.b, N)],
        value: d.kind === 'x' ? 'X' : 'V',
      }));
    }

    /* --- outside clues: skyscraper, sandwich, x-sums --- */
    const sideEdgeClues = (arrObj, key) => {
      if (!arrObj) return;
      const acc = [];
      for (const side of ['top', 'bottom', 'left', 'right']) {
        const arr = arrObj[side];
        if (!arr) continue;
        for (let k = 0; k < arr.length; k++) {
          const v = arr[k];
          if (!v) continue;
          acc.push({ cell: outerCell(side, k, N), value: String(v) });
        }
      }
      if (acc.length) out[key] = acc;
    };
    sideEdgeClues(p.sky,      'skyscraper');
    sideEdgeClues(p.sandwich, 'sandwichsum');
    sideEdgeClues(p.xsum,     'xsum');

    /* --- little killer --- */
    if ((p.littleKillers || []).length) {
      out.littlekillersum = p.littleKillers.map(lk => ({
        cell: outerCell(lk.side, lk.idx, N),
        direction: LK_DIR[lk.dir] || 'DR',
        value: String(lk.sum),
      }));
    }

    /* --- Decorative fallbacks for constraints SudokuPad doesn't parse.
       They render but don't enforce anything, so we also record the drop
       so the caller can warn the user. --- */
    const decoLines = [];
    const addDecoLine = (list, color, dropId) => {
      if (!list || !list.length) return;
      for (const l of list) {
        if (!l || !l.length) continue;
        decoLines.push({
          lines: [l.map(i => idxRC(i, N))],
          outlineC: color,
          width: 0.2,
          isNewConstraint: true,
        });
      }
      dropped.add(dropId);
    };
    addDecoLine(p.slowThermos,   DECO.slowThermo,   'slow-thermo');
    addDecoLine(p.lockoutLines,  DECO.lockoutLine,  'lockout');
    addDecoLine(p.sequenceLines, DECO.sequenceLine, 'sequence');
    addDecoLine(p.parityLines,   DECO.parityLine,   'parity-line');

    /* Hitpoint arrows: draw one short segment per set direction so the
       intent survives even without logic. */
    const DIR8 = [
      [-1, 0], [-1, 1], [0, 1], [1, 1],
      [1, 0], [1, -1], [0, -1], [-1, -1],
    ];
    if ((p.hitpoints || []).length) {
      for (const hp of p.hitpoints) {
        if (!hp.dirs) continue;
        const r0 = (hp.cell / N) | 0, c0 = hp.cell % N;
        for (let d = 0; d < 8; d++) {
          if (!(hp.dirs & (1 << d))) continue;
          const [dr, dc] = DIR8[d];
          const r1 = r0 + dr, c1 = c0 + dc;
          if (r1 < 0 || r1 >= N || c1 < 0 || c1 >= N) continue;
          decoLines.push({
            lines: [[idxRC(hp.cell, N), RC(r1 + 1, c1 + 1)]],
            outlineC: DECO.hitpoint,
            width: 0.15,
            isNewConstraint: true,
          });
        }
      }
      dropped.add('hitpoint-arrow');
    }
    if (decoLines.length) out.line = decoLines;

    /* Cell-decoration fallbacks. */
    const circles = [];
    const texts = [];
    if (p.countCircles) {
      for (let i = 0; i < total; i++) {
        if (!p.countCircles[i]) continue;
        circles.push({
          cells: [idxRC(i, N)],
          baseC: '#ffffff',
          outlineC: DECO.countCircle,
          fontC: '#000000',
          width: 0.7, height: 0.7,
          angle: 0,
          isNewConstraint: true,
          value: '',
        });
      }
      if (circles.length) dropped.add('count-circle');
    }
    if (p.colIndex) {
      for (let i = 0; i < total; i++) {
        if (!p.colIndex[i]) continue;
        texts.push({
          cells: [idxRC(i, N)],
          value: 'C',
          fontC: DECO.indexCol,
          size: 0.3,
          isNewConstraint: true,
        });
      }
      if (texts.length) dropped.add('col-index');
    }
    if (p.rowIndex) {
      const before = texts.length;
      for (let i = 0; i < total; i++) {
        if (!p.rowIndex[i]) continue;
        texts.push({
          cells: [idxRC(i, N)],
          value: 'R',
          fontC: DECO.indexRow,
          size: 0.3,
          isNewConstraint: true,
        });
      }
      if (texts.length > before) dropped.add('row-index');
    }
    if (circles.length) out.circle = circles;
    if (texts.length)   out.text   = texts;

    /* Constraints we drop entirely (no useful decorative shim). */
    if ((p.compare || []).length) dropped.add('compare');
    if (p.rainbow && Array.prototype.some.call(p.rainbow, v => !!v)) dropped.add('spectradoku');

    return { fpuz: out, dropped: [...dropped] };
  }

  function buildLink(p) {
    if (typeof LZString === 'undefined' || !LZString.compressToBase64) {
      throw new Error('LZString.compressToBase64 not available — vendor/lz-string.min.js missing?');
    }
    const { fpuz, dropped } = toFpuzzlesJson(p);
    const json = JSON.stringify(fpuz);
    const compressed = LZString.compressToBase64(json);
    const url = `https://sudokupad.app/?puzzleid=fpuzzles${encodeURIComponent(compressed)}`;
    return { url, dropped };
  }

  window.SudokuPadExport = {
    toFpuzzlesJson,
    buildLink,
    _internal: { RC, idxRC, outerCell, LK_DIR, DECO, rectRegions, nearestBaseIdx },
  };
})();
