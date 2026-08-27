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
 * f-puzzles / SudokuPad only render a subset of variant constraints
 * natively. Anything outside that subset (whisper, region-sum, modular,
 * entropic, parity-line, slow-thermo, lockout, sequence, compare, and
 * self-referential markers like count-circle / index cells / hitpoints)
 * is emitted as a decorative overlay in a distinct color, and the puzzle's
 * `ruleset` field carries a text legend describing what each color means.
 * The player then sees the correct visual layout on SudokuPad and reads
 * the rules from the description panel.
 *
 * Native fpuzzles constraints kept as-is:
 *   givens, region overrides, X-sudoku, anti-knight/king/consecutive,
 *   disjoint groups, killer cages, thermometer, arrow, renban, palindrome,
 *   betweenline, extra region, quadruple, odd/even, kropki (difference /
 *   ratio), XV, skyscraper, sandwichsum, x-sums, little killer.
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
     Colors are chosen distinct from each other AND from fpuzzles' own
     defaults (thermo gray, arrow black) so the legend stays readable.
     Each entry drives both the drawn overlay and the ruleset legend. */
  const DECO = {
    whisper:      { color: '#10b981', label: { en: 'green',        zh: '绿色' } },
    regionSum:    { color: '#3b82f6', label: { en: 'blue',         zh: '蓝色' } },
    modular:      { color: '#a855f7', label: { en: 'purple',       zh: '紫色' } },
    entropic:     { color: '#f97316', label: { en: 'orange',       zh: '橙色' } },
    parityLine:   { color: '#ec4899', label: { en: 'pink',         zh: '粉红色' } },
    slowThermo:   { color: '#9ca3af', label: { en: 'light gray',   zh: '浅灰色' } },
    lockout:      { color: '#f43f5e', label: { en: 'rose',         zh: '玫红色' } },
    sequence:     { color: '#14b8a6', label: { en: 'teal',         zh: '青绿色' } },
    hitpoint:     { color: '#1e40af', label: { en: 'dark blue',    zh: '深蓝色' } },
    countCircle:  { color: '#000000', label: { en: 'black circle', zh: '黑圆' } },
    indexCol:     { color: '#009688', label: { en: 'teal "C"',     zh: '青色 C' } },
    indexRow:     { color: '#795548', label: { en: 'brown "R"',    zh: '棕色 R' } },
  };

  const N_WORD = (N) => `⌈${N}/2⌉`;

  /* Ruleset (description) blurbs per constraint. When the puzzle uses a
     given constraint we append its rule to a `ruleset` field so SudokuPad's
     Rules pane spells out what the color means. */
  function ruleBlurbs(N) {
    return {
      whisper:     { en: `${DECO.whisper.label.en} line — adjacent digits differ by at least ${N_WORD(N)}.`,
                     zh: `${DECO.whisper.label.zh}线：相邻数字之差 ≥ ${N_WORD(N)}。` },
      regionSum:   { en: `${DECO.regionSum.label.en} line — segments inside each region share the same sum.`,
                     zh: `${DECO.regionSum.label.zh}线：线在每个宫内的部分和相同。` },
      modular:     { en: `${DECO.modular.label.en} line — every three consecutive cells cover residues {0,1,2} mod 3.`,
                     zh: `${DECO.modular.label.zh}线：任意三连格覆盖 mod 3 的 {0,1,2} 剩余。` },
      entropic:    { en: `${DECO.entropic.label.en} line — every three consecutive cells hit low / mid / high thirds (1-3 / 4-6 / 7-9 on 9×9).`,
                     zh: `${DECO.entropic.label.zh}线：任意三连格分别落在低/中/高三分区。` },
      parityLine:  { en: `${DECO.parityLine.label.en} line — adjacent digits alternate odd / even.`,
                     zh: `${DECO.parityLine.label.zh}线：相邻数字奇偶交替。` },
      slowThermo:  { en: `${DECO.slowThermo.label.en} line (slow thermometer) — digits along the line are non-decreasing from the bulb.`,
                     zh: `${DECO.slowThermo.label.zh}线（慢速温度计）：从球端起沿线非递减。` },
      lockout:     { en: `${DECO.lockout.label.en} line — endpoints differ by at least 4; every middle digit lies outside [min, max] of the endpoints.`,
                     zh: `${DECO.lockout.label.zh}线：端点差 ≥ 4；中间数字在端点区间之外。` },
      sequence:    { en: `${DECO.sequence.label.en} line — digits form an arithmetic sequence.`,
                     zh: `${DECO.sequence.label.zh}线：数字构成等差数列。` },
      hitpoint:    { en: `${DECO.hitpoint.label.en} short arrows — the arrow cell's digit equals the total of "hits" along its directions (a hit is a downstream cell whose digit equals its distance).`,
                     zh: `${DECO.hitpoint.label.zh}短箭头：起点数字 = 各方向上「命中数」之和（命中：下游格数字 = 距离）。` },
      compare:     { en: 'Comparison marks (< / >) on shared edges show the digit relation between the two neighbouring cells.',
                     zh: '相邻两格边界上的 </> 号表示两格之间的大小关系。' },
      countCircle: { en: `${DECO.countCircle.label.en}s (counting circles) — if digit v appears in any circle, exactly v circles hold the digit v.`,
                     zh: `${DECO.countCircle.label.zh}（计数圆）：若数字 v 出现在圆内，则恰有 v 个圆内含 v。` },
      indexCol:    { en: `${DECO.indexCol.label.en} marker — column-index cell: if a value at (r, c) is z, then (r, z) holds c.`,
                     zh: `${DECO.indexCol.label.zh} 标记：列索引格：若 (r, c) 位置为 z，则 (r, z) 位置为 c。` },
      indexRow:    { en: `${DECO.indexRow.label.en} marker — row-index cell: if a value at (r, c) is z, then (z, c) holds r.`,
                     zh: `${DECO.indexRow.label.zh} 标记：行索引格：若 (r, c) 位置为 z，则 (z, c) 位置为 r。` },
      spectradoku: { en: 'Spectradoku (rainbow) coloring is not shown on SudokuPad; digits still obey the row / column / box / color-partition rules.',
                     zh: '光谱数独（彩虹）着色未在 SudokuPad 中显示；数字仍需满足行 / 列 / 宫 / 颜色分区规则。' },
    };
  }

  /* Duplicate of SudokuCore.rectRegions — kept local so this file loads
     even if sudoku-core.js is unavailable (unusual, but avoids coupling). */
  function rectRegions(N, boxR, boxC) {
    const boxesPerRow = N / boxC;
    const out = new Int8Array(N * N);
    for (let i = 0; i < N * N; i++) {
      const r = (i / N) | 0, c = i % N;
      out[i] = Math.floor(r / boxR) * boxesPerRow + Math.floor(c / boxC);
    }
    return out;
  }

  /* Pick the pill (base) cell nearest to the first shaft cell — matches
     the "arrow attaches at the closest corner" convention that fpuzzles
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

  function toFpuzzlesJson(p, opts) {
    opts = opts || {};
    const lang = opts.lang === 'zh' ? 'zh' : 'en';
    const N = p.N;
    const total = N * N;
    /* `dropped` — constraints whose logic isn't enforced by SudokuPad.
       Rendered visually via decorative overlays; still worth flagging so
       the player knows to read the rules pane. */
    const dropped = new Set();
    const rules = ruleBlurbs(N);
    const legend = [];

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
      if (regionsDiverge) cell.region = p.regions[i];
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

    /* --- native constraints --- */
    if ((p.cages || []).length) {
      out.killercage = p.cages.map(c => {
        const entry = { cells: c.cells.map(i => idxRC(i, N)) };
        if (c.sum != null) entry.value = String(c.sum);
        return entry;
      });
    }
    if ((p.thermos || []).length) {
      out.thermometer = p.thermos.map(t => ({ lines: [t.map(i => idxRC(i, N))] }));
    }
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

    const mapLines = (list) => list.map(l => ({ lines: [l.map(i => idxRC(i, N))] }));
    if ((p.renbans     || []).length) out.renban       = mapLines(p.renbans);
    if ((p.palindromes || []).length) out.palindrome   = mapLines(p.palindromes);
    if ((p.betweenLines|| []).length) out.betweenline  = mapLines(p.betweenLines);

    if ((p.extraRegions || []).length) {
      out.extraregion = p.extraRegions.map(er => ({
        cells: er.cells.map(i => idxRC(i, N)),
      }));
    }

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

    if (p.parity) {
      const odd = [], even = [];
      for (let i = 0; i < total; i++) {
        if (p.parity[i] === 1) odd.push({ cell: idxRC(i, N) });
        else if (p.parity[i] === 2) even.push({ cell: idxRC(i, N) });
      }
      if (odd.length)  out.odd  = odd;
      if (even.length) out.even = even;
    }

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

    if ((p.xv || []).length) {
      out.xv = p.xv.map(d => ({
        cells: [idxRC(d.a, N), idxRC(d.b, N)],
        value: d.kind === 'x' ? 'X' : 'V',
      }));
    }

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

    if ((p.littleKillers || []).length) {
      out.littlekillersum = p.littleKillers.map(lk => ({
        cell: outerCell(lk.side, lk.idx, N),
        direction: LK_DIR[lk.dir] || 'DR',
        value: String(lk.sum),
      }));
    }

    /* --- decorative colored lines for non-native constraints --- */
    const decoLines = [];
    const addDecoLine = (list, deco, dropId, ruleKey) => {
      if (!list || !list.length) return;
      let added = false;
      for (const l of list) {
        if (!l || !l.length) continue;
        decoLines.push({
          lines: [l.map(i => idxRC(i, N))],
          outlineC: deco.color,
          width: 0.2,
          isNewConstraint: true,
        });
        added = true;
      }
      if (added) {
        dropped.add(dropId);
        if (ruleKey && rules[ruleKey]) legend.push(rules[ruleKey][lang]);
      }
    };
    addDecoLine(p.whispers,      DECO.whisper,     'whisper',     'whisper');
    addDecoLine(p.regionSums,    DECO.regionSum,   'region-sum',  'regionSum');
    addDecoLine(p.modulars,      DECO.modular,     'modular',     'modular');
    addDecoLine(p.entropics,     DECO.entropic,    'entropic',    'entropic');
    addDecoLine(p.parityLines,   DECO.parityLine,  'parity-line', 'parityLine');
    addDecoLine(p.slowThermos,   DECO.slowThermo,  'slow-thermo', 'slowThermo');
    addDecoLine(p.lockoutLines,  DECO.lockout,     'lockout',     'lockout');
    addDecoLine(p.sequenceLines, DECO.sequence,    'sequence',    'sequence');

    /* Hitpoint arrows: one short segment per set direction so intent survives. */
    const DIR8 = [
      [-1, 0], [-1, 1], [0, 1], [1, 1],
      [1, 0], [1, -1], [0, -1], [-1, -1],
    ];
    if ((p.hitpoints || []).length) {
      let any = false;
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
            outlineC: DECO.hitpoint.color,
            width: 0.15,
            isNewConstraint: true,
          });
          any = true;
        }
      }
      if (any) { dropped.add('hitpoint-arrow'); legend.push(rules.hitpoint[lang]); }
    }
    if (decoLines.length) out.line = decoLines;

    /* --- Compare marks: text "<" / ">" straddling the shared edge --- */
    const texts = [];
    if ((p.compare || []).length) {
      let any = false;
      for (const d of p.compare) {
        /* In fpuzzles, a text spanning two cells is drawn at the midpoint —
           perfect for an edge marker. We orient the glyph so it always
           points from the "less" cell to the "greater" cell. */
        const [a, b] = d.kind === 'lt' ? [d.a, d.b] : [d.b, d.a];
        /* a < b: glyph should point from a toward b. Determine adjacency. */
        const ra = (a / N) | 0, ca = a % N;
        const rb = (b / N) | 0, cb = b % N;
        let glyph = '<';
        if      (rb === ra && cb === ca + 1) glyph = '<';   /* a-|b horizontal: a is left, "<" opens right toward greater */
        else if (rb === ra && cb === ca - 1) glyph = '>';   /* a is right */
        else if (rb === ra + 1 && cb === ca) glyph = '∧';   /* a on top, b below → point down */
        else if (rb === ra - 1 && cb === ca) glyph = '∨';   /* a below, b on top → point up */
        texts.push({
          cells: [idxRC(a, N), idxRC(b, N)],
          value: glyph,
          fontC: '#000000',
          size: 0.5,
          isNewConstraint: true,
        });
        any = true;
      }
      if (any) { dropped.add('compare'); legend.push(rules.compare[lang]); }
    }

    /* --- Cell decorations: count-circle, col-index, row-index --- */
    const circles = [];
    if (p.countCircles) {
      let any = false;
      for (let i = 0; i < total; i++) {
        if (!p.countCircles[i]) continue;
        circles.push({
          cells: [idxRC(i, N)],
          baseC: '#ffffff',
          outlineC: DECO.countCircle.color,
          fontC: '#000000',
          width: 0.7, height: 0.7,
          angle: 0,
          isNewConstraint: true,
          value: '',
        });
        any = true;
      }
      if (any) { dropped.add('count-circle'); legend.push(rules.countCircle[lang]); }
    }
    if (p.colIndex) {
      let any = false;
      for (let i = 0; i < total; i++) {
        if (!p.colIndex[i]) continue;
        texts.push({
          cells: [idxRC(i, N)],
          value: 'C',
          fontC: DECO.indexCol.color,
          size: 0.3,
          isNewConstraint: true,
        });
        any = true;
      }
      if (any) { dropped.add('col-index'); legend.push(rules.indexCol[lang]); }
    }
    if (p.rowIndex) {
      let any = false;
      for (let i = 0; i < total; i++) {
        if (!p.rowIndex[i]) continue;
        texts.push({
          cells: [idxRC(i, N)],
          value: 'R',
          fontC: DECO.indexRow.color,
          size: 0.3,
          isNewConstraint: true,
        });
        any = true;
      }
      if (any) { dropped.add('row-index'); legend.push(rules.indexRow[lang]); }
    }
    if (circles.length) out.circle = circles;
    if (texts.length)   out.text   = texts;

    /* Spectradoku has no useful visual — call it out in the ruleset. */
    if (p.rainbow && Array.prototype.some.call(p.rainbow, v => !!v)) {
      dropped.add('spectradoku');
      legend.push(rules.spectradoku[lang]);
    }

    /* --- ruleset: color legend for non-native constraints --- */
    if (legend.length) {
      const header = lang === 'zh'
        ? 'SudokuPad 未原生支持的约束通过颜色/标记表示，逻辑仍需玩家自行遵守：'
        : 'SudokuPad does not natively enforce these constraints — they are shown by color/marker and the rules below apply:';
      out.ruleset = header + '\n\n• ' + legend.join('\n• ');
    }

    return { fpuz: out, dropped: [...dropped], legend };
  }

  function buildLink(p, opts) {
    if (typeof LZString === 'undefined' || !LZString.compressToBase64) {
      throw new Error('LZString.compressToBase64 not available — vendor/lz-string.min.js missing?');
    }
    const { fpuz, dropped, legend } = toFpuzzlesJson(p, opts);
    const json = JSON.stringify(fpuz);
    const compressed = LZString.compressToBase64(json);
    const url = `https://sudokupad.app/?puzzleid=fpuzzles${encodeURIComponent(compressed)}`;
    return { url, dropped, legend };
  }

  window.SudokuPadExport = {
    toFpuzzlesJson,
    buildLink,
    _internal: { RC, idxRC, outerCell, LK_DIR, DECO, rectRegions, nearestBaseIdx },
  };
})();
