/*
 * sudoku.js — UI for variant sudoku.
 *
 * Manages the puzzle state defined by SudokuCore and lets the user edit:
 *   - Grid size (any A×B box shape, 4 ≤ N ≤ 16)
 *   - Digits (given clues)
 *   - Jigsaw regions (paint tool)
 *   - Killer cages (multi-select + sum)
 *   - Thermometers (path tool)
 *   - Skyscraper edge clues
 *   - Rule toggles: diagonal, anti-knight, anti-king, anti-consecutive
 *
 * Everything lives inside `SudokuApp`; app.js just calls `render(container)`.
 */
window.SudokuApp = (function () {
  const Core = window.SudokuCore;
  const { MIN_N, MAX_N, digitToChar, charToDigit, isDigitKey } = Core;

  const PRESETS = [
    { N: 4,  boxR: 2, boxC: 2, label: '4×4'   },
    { N: 6,  boxR: 2, boxC: 3, label: '6×6'   },
    { N: 8,  boxR: 2, boxC: 4, label: '8×8'   },
    { N: 9,  boxR: 3, boxC: 3, label: '9×9'   },
    { N: 12, boxR: 3, boxC: 4, label: '12×12' },
    { N: 16, boxR: 4, boxC: 4, label: '16×16' },
  ];

  /* Region palette — muted HSL steps meant as a drawing aid; both themes
     stay close to the surface color so the tint doesn't compete with cell
     content when regions are being edited. */
  const REGION_HUES = [
    210, 30, 140, 300, 260, 45, 190, 0,
    170, 105, 330, 15, 240, 60, 285, 155,
  ];
  function regionColor(idx, theme) {
    const h = REGION_HUES[idx % REGION_HUES.length];
    return theme === 'light'
      ? `hsl(${h}, 65%, 92%)`
      : `hsl(${h}, 45%, 22%)`;
  }

  /* Spectradoku palette — vivid, named colors that survive in both themes.
     The first nine slots follow the user-specified mapping
       1-red 2-orange 3-yellow 4-green 5-cyan 6-blue 7-purple 8-gray 9-black
     and slots 10..16 extend the palette for larger grids. Digits rendered
     over these cells get a white outline (see styles.css) so they read
     clearly against every hue, including yellow and black. */
  const SPECTRA_PALETTE = [
    '#e53935',  /*  1 red     */
    '#fb8c00',  /*  2 orange  */
    '#fdd835',  /*  3 yellow  */
    '#43a047',  /*  4 green   */
    '#00acc1',  /*  5 cyan    */
    '#1e88e5',  /*  6 blue    */
    '#8e24aa',  /*  7 purple  */
    '#9e9e9e',  /*  8 gray    */
    '#212121',  /*  9 black   */
    '#ec407a',  /* 10 pink    */
    '#00897b',  /* 11 teal    */
    '#6d4c41',  /* 12 brown   */
    '#c0ca33',  /* 13 lime    */
    '#3949ab',  /* 14 indigo  */
    '#00838f',  /* 15 dark cyan */
    '#5d4037',  /* 16 dark brown */
  ];
  function spectraColor(idx) {
    return SPECTRA_PALETTE[idx % SPECTRA_PALETTE.length];
  }

  const NAME = { en: 'Variant Sudoku Solver', zh: '变体数独求解器' };
  const DESCRIPTION = {
    en: 'Choose a size and box shape, add optional constraints (regions, Spectradoku colors, cages, thermos, skyscrapers, sandwich, German whisper / region-sum / modular lines, Kropki dots, X, anti-knight/king), then type given digits. Empty cells show a solution.',
    zh: '选择网格尺寸与宫格形状，添加可选约束（异形宫、光谱数独、杀手框、温度计、摩天楼、三明治、德国耳语线/区域和线/模 3 线、黑白点、对角、反马步/反王步等），再输入已知数字。空格自动显示一种解。',
  };

  const T = {
    tab: {
      digit:     { en: 'Digits',       zh: '数字' },
      region:    { en: 'Regions',      zh: '宫格' },
      rainbow:   { en: 'Spectradoku',  zh: '光谱数独' },
      cage:      { en: 'Cages',        zh: '杀手框' },
      thermo:    { en: 'Thermo',       zh: '温度计' },
      sky:       { en: 'Skyscraper',   zh: '摩天楼' },
      sandwich:  { en: 'Sandwich',     zh: '三明治' },
      whisper:   { en: 'Whisper',      zh: '德国耳语线' },
      regionSum: { en: 'Region Sum',   zh: '区域和线' },
      modular:   { en: 'Modular',      zh: '模 3 线' },
      renban:    { en: 'Renban',       zh: '连线' },
      palindrome:{ en: 'Palindrome',   zh: '回文线' },
      entropic:  { en: 'Entropic',     zh: '熵线' },
      parityLine:{ en: 'Parity Line',  zh: '奇偶线' },
      arrow:     { en: 'Arrow',        zh: '箭头' },
      quadruple: { en: 'Quadruple',    zh: '四方组' },
      kropki:    { en: 'Kropki',       zh: '黑白点' },
      compare:   { en: 'Compare',      zh: '大小符' },
      xv:        { en: 'XV',           zh: 'XV' },
      parity:    { en: 'Odd/Even',     zh: '奇偶' },
      littleKiller:{ en: 'Little Killer', zh: '小杀手' },
      colIndex:  { en: 'Column Index', zh: '列索引' },
      rowIndex:  { en: 'Row Index',    zh: '行索引' },
      hitpoint:  { en: 'Hitpoint',     zh: '命中箭头' },
      extraRegion:{ en: 'Extra Region', zh: '额外宫' },
      slowThermo:{ en: 'Slow Thermo',  zh: '慢速温度计' },
      between:   { en: 'Between',      zh: '介于线' },
      lockout:   { en: 'Lockout',      zh: '禁区线' },
      sequence:  { en: 'Sequence',     zh: '等差线' },
      xsum:      { en: 'X-Sums',       zh: 'X 和' },
      countCircle:{ en: 'Count Circle', zh: '计数圆' },
      grid:      { en: '✂ Grid shape', zh: '✂ 网格形状' },
    },
    flag: {
      diagonal:        { en: 'X (diagonals)',     zh: 'X（对角）' },
      antiKnight:      { en: 'Anti-Knight',       zh: '反马步' },
      antiKing:        { en: 'Anti-King',         zh: '反王步' },
      antiConsecutive: { en: 'Anti-Consecutive',  zh: '反邻数' },
      disjoint:        { en: 'Disjoint Groups',   zh: '同位置组' },
    },
    hint: {
      digit:  { en: 'Type 1..9 / A..G to place a given. Backspace clears.',
                zh: '输入 1..9 / A..G 填入已知数字，Backspace 清除。' },
      region: { en: 'Pick a region color, then click or drag across cells to paint. Each region needs exactly N cells.',
                zh: '选择一种颜色后点击或拖动格子上色。每个宫格必须包含 N 个单元格。' },
      rainbow:{ en: 'Spectradoku: pick a color, then click or drag to color cells. Each row/column/box must contain all N colors, and each digit must appear once in every color.',
                zh: '光谱数独：选择一种颜色后点击或拖动格子上色。每行/列/宫必须包含全部 N 种颜色，且每个数字在 N 种颜色中各出现一次。' },
      cage:   { en: 'Click-drag to paint cells into the current cage (drag on selected cells to remove them). Click any finalized cage to edit its shape and sum. Enter a sum, then "Finish cage" to lock it.',
                zh: '按住并拖动可将格子加入当前杀手框（在已选格上拖动可移除）。点击已完成的杀手框即可修改其形状与总和。输入总和后按"完成杀手框"锁定。' },
      thermo: { en: 'Click or drag along cells in order (orthogonal or diagonal) — the first cell is the bulb. Values must strictly increase along the path. "Finish thermo" to start a new one.',
                zh: '按顺序点击或拖动格子（正交或对角相邻），首格为温度计球端，数值沿路径严格递增。按"完成温度计"开始新一根。' },
      sky:    { en: 'Type a visible-skyscraper count 1..N into any outer edge cell. Blank clears.',
                zh: '在任意外圈格中输入 1..N 的摩天楼可见数，留空清除。' },
      sandwich: { en: 'Type the sum of digits strictly between 1 and N in that row/column. Blank clears.',
                  zh: '在外圈格中输入该行/列 1 与 N 之间数字的和，留空清除。' },
      whisper:  { en: 'Click or drag along adjacent cells (orthogonal or diagonal). On the green line, neighbours must differ by ≥ ⌈N/2⌉.',
                  zh: '点击或拖动相邻格（正交或对角）。绿线上相邻两格的差必须 ≥ ⌈N/2⌉。' },
      regionSum:{ en: 'Click or drag along adjacent cells (orthogonal or diagonal). The blue line’s portion inside each region must share one sum.',
                  zh: '点击或拖动相邻格（正交或对角）。蓝线在每个宫格内的分段和必须相等。' },
      modular:  { en: 'Click or drag along adjacent cells (orthogonal or diagonal). Any 3 consecutive cells on the purple line must cover residues {0,1,2} mod 3.',
                  zh: '点击或拖动相邻格（正交或对角）。紫线上任意 3 个连续格的余数必须覆盖 {0,1,2} (mod 3)。' },
      renban:   { en: 'Click or drag along adjacent cells. The digits on a renban line form a set of consecutive numbers in any order, no repeats.',
                  zh: '点击或拖动相邻格。连线上的数字为若干连续数（任意顺序，不重复）。' },
      palindrome: { en: 'Click or drag along adjacent cells. Digits on a palindrome read the same forwards and backwards.',
                    zh: '点击或拖动相邻格。回文线上的数字正读反读相同。' },
      entropic: { en: 'Click or drag along adjacent cells. Every 3 consecutive cells must include one digit from Low, Mid, and High thirds (e.g. 1-3 / 4-6 / 7-9).',
                  zh: '点击或拖动相邻格。任意连续 3 格必须包含低、中、高三段各一个数字（例如 1-3 / 4-6 / 7-9）。' },
      parityLine:{ en: 'Click or drag along adjacent cells. Consecutive cells alternate odd / even.',
                   zh: '点击或拖动相邻格。相邻格的奇偶性交替。' },
      arrow:    { en: 'Two phases: paint the base (pill of 1-3 orthogonally-adjacent cells) then "Next: shaft" and paint the shaft cells. Shaft digits sum to the multi-digit number on the base. "Finish arrow" to lock.',
                  zh: '两步：先绘制圆圈（1-3 个正交相邻的格子组成的胶囊），然后按"下一步：箭杆"绘制箭杆。箭杆数字之和等于圆圈上读出的数。按"完成箭头"锁定。' },
      quadruple:{ en: 'Type up to 4 required digits, then click a cell — the mark is placed at the intersection whose top-left cell is the one you clicked. Each digit must appear in at least one of the 4 surrounding cells. Click again to clear.',
                  zh: '在框中输入需要的 1-4 个数字，然后点击格子 — 标记会放在该格右下方的交点，四个相邻格中至少有一个含该数字。再次点击相同交点可清除。' },
      kropki:   { en: 'Pick a dot type, then click two orthogonally-adjacent cells to toggle a dot between them. White = consecutive, black = ratio 2.',
                  zh: '选择黑/白点，然后点击两个正交相邻的格子在其边上放置/移除点。白点为相邻数，黑点为倍数关系。' },
      compare:  { en: 'Pick "<" or ">", then click two orthogonally-adjacent cells in order. The mark on the shared edge points at the smaller cell.',
                  zh: '选择"<"或">"，然后按顺序点击两个正交相邻格；共享边上的符号开口朝向较大的格。' },
      xv:       { en: 'Pick X (sum 10) or V (sum 5), then click two orthogonally-adjacent cells to toggle the mark on their shared edge.',
                  zh: '选择 X（和为 10）或 V（和为 5），然后点击两个正交相邻的格子在其边上放置/移除标记。' },
      parity:   { en: 'Pick Odd (circle) or Even (square), then click or drag across cells to mark them. Click a marked cell with the same tool to clear.',
                  zh: '选择"奇"（圆圈）或"偶"（方块），然后点击或拖动格子标记；对已相同标记的格再次点击可清除。' },
      littleKiller: {
        en: 'Click any outer-edge cell to pick a diagonal anchor. Choose a direction (1 or 2 options depending on position) and enter a sum, then Add. Diagonals reached from either end are treated as the same arrow — the editor blocks duplicates. Click existing arrows here to delete them.',
        zh: '点击网格外圈任一格作为对角锚点，按其位置选择方向（1 或 2 种），输入总和后按"添加"。同一对角线的两个端点视为同一箭头，编辑器会阻止重复。点击此处已有箭头可删除。',
      },
      colIndex: {
        en: 'Click or drag over cells to mark them. In a marked cell at (X, Y): if the digit is Z, then row X column Z must equal Y.',
        zh: '点击或拖动格子标记。若已标记格 (X, Y) 中的数字为 Z，则第 X 行第 Z 列必须等于 Y。',
      },
      rowIndex: {
        en: 'Click or drag over cells to mark them. In a marked cell at (X, Y): if the digit is Z, then row Z column Y must equal X.',
        zh: '点击或拖动格子标记。若已标记格 (X, Y) 中的数字为 Z，则第 Z 行第 Y 列必须等于 X。',
      },
      hitpoint: {
        en: 'Pick one of the 8 compass directions, then click a cell to toggle that arrow on it. A cell may have multiple arrows. The cell\'s digit equals the sum over each arrow direction of downstream cells whose value V equals its distance k from the arrow cell.',
        zh: '先选择 8 方向中的一个，再点击格子切换该方向的箭头。同一格可有多个方向。该格数字 D 等于：对每个方向沿该方向前进，若第 k 格数字 V 等于 k，则将 V 计入总和；总和等于 D。',
      },
      extraRegion: {
        en: 'Pick a color, then paint cells that share a "no-repeat" region. Each color is a separate region — digits cannot repeat within one. "Finish region" to start a new one.',
        zh: '选择颜色后，绘制额外宫的格子。同一颜色的格子构成一个"不可重复"的宫，其中数字互不相同。按"完成额外宫"开始新的一个。',
      },
      slowThermo: {
        en: 'Same as thermo, but digits are non-strictly increasing along the path (repeats allowed). First cell is the bulb.',
        zh: '类似温度计，但数字沿路径非严格递增（允许相等）。首格为球端。',
      },
      between: {
        en: 'Draw a line whose two ends are circled bulbs. Digits at every middle cell must be strictly between the two endpoints.',
        zh: '绘制一条两端为圆圈的线。中间每个格子的数字必须严格介于两端点之间。',
      },
      lockout: {
        en: 'Draw a line whose two ends are diamond bulbs. Endpoints must differ by ≥ 4, and every middle cell must be strictly outside [min, max] of the endpoints.',
        zh: '绘制一条两端为菱形的线。端点数字之差 ≥ 4，中间格必须严格位于两端点区间 [min, max] 之外。',
      },
      sequence: {
        en: 'Draw a line. Digits along the line form an arithmetic progression (any step, including 0).',
        zh: '绘制一条线。线上数字构成等差数列（差值任意，可为 0）。',
      },
      xsum: {
        en: 'Type an X-sum clue into any outer edge cell: the first digit read from the outside is X, and the first X digits sum to the clue value.',
        zh: '在任意外圈格中输入 X 和线索：从外侧读到的第一位数字为 X，且前 X 个数字之和等于该线索值。',
      },
      countCircle: {
        en: 'Click or drag cells to add or remove circles. If digit v appears on any circled cell, exactly v circled cells contain v.',
        zh: '点击或拖动格子添加或移除圆圈。若数字 v 出现在任一圆圈内，则恰好有 v 个圆圈内含 v。',
      },
      grid: {
        en: 'Set rows, columns, and digit count, then Apply. Click cells to toggle them as deleted (holes). After applying an irregular shape you should repaint the regions.',
        zh: '设置行数、列数、数字个数，然后按"应用"。点击格子可将其标记为删除（空缺）。应用不规则形状后应重画宫格。',
      },
    },
    solve:   { en: 'Solve',           zh: '求解' },
    prev:    { en: '◀ Previous',      zh: '◀ 上一解' },
    next:    { en: 'Next ▶',          zh: '下一解 ▶' },
    pencil:  { en: 'Pencilmarks',     zh: '候选数' },
    reset:   { en: 'Clear digits',    zh: '清空数字' },
    example: { en: 'Load example',    zh: '载入示例' },
    wipe:    { en: 'Clear all',       zh: '全部清除' },
    live:    { en: 'Live solve',      zh: '实时求解' },
    boxRLbl: { en: 'Box rows',        zh: '宫格行数' },
    boxCLbl: { en: 'Box cols',        zh: '宫格列数' },
    newCage: { en: 'Finish cage',     zh: '完成杀手框' },
    newTh:   { en: 'Finish thermo',   zh: '完成温度计' },
    delSel:  { en: 'Delete last cell', zh: '删除最后一格' },
    sumLbl:  { en: 'Sum',             zh: '总和' },
    regLbl:  { en: 'Region',          zh: '宫格 ID' },
    finishLine: { en: 'Finish line',  zh: '完成线' },
    delLine:    { en: 'Delete last line', zh: '删除上一条线' },
    dotWhite:   { en: 'White dot',    zh: '白点' },
    dotBlack:   { en: 'Black dot',    zh: '黑点' },
    clearDots:  { en: 'Clear all dots', zh: '清空所有点' },
    cmpLt:      { en: '< (a < b)',    zh: '< （a < b）' },
    cmpGt:      { en: '> (a > b)',    zh: '> （a > b）' },
    clearCmp:   { en: 'Clear all compare', zh: '清空所有大小符' },
    xvX:        { en: 'X (sum 10)',   zh: 'X（和 10）' },
    xvV:        { en: 'V (sum 5)',    zh: 'V（和 5）' },
    clearXV:    { en: 'Clear all XV', zh: '清空所有 XV' },
    parOdd:     { en: 'Odd (○)',      zh: '奇（○）' },
    parEven:    { en: 'Even (□)',     zh: '偶（□）' },
    clearParity:{ en: 'Clear all parity', zh: '清空所有奇偶标记' },
    finishER:   { en: 'Finish region', zh: '完成额外宫' },
    delLastER:  { en: 'Delete last region', zh: '删除上一额外宫' },
    finishSlow: { en: 'Finish slow thermo', zh: '完成慢温度计' },
    finishBet:  { en: 'Finish between line', zh: '完成介于线' },
    finishLo:   { en: 'Finish lockout',   zh: '完成禁区线' },
    finishSeq:  { en: 'Finish sequence',  zh: '完成等差线' },
  };

  /* Which puzzle field each line-based tool uses. */
  const LINE_FIELD = {
    whisper:    'whispers',
    regionSum:  'regionSums',
    modular:    'modulars',
    renban:     'renbans',
    palindrome: 'palindromes',
    entropic:   'entropics',
    parityLine: 'parityLines',
    slowThermo: 'slowThermos',
    between:    'betweenLines',
    lockout:    'lockoutLines',
    sequence:   'sequenceLines',
  };
  /* Tool ids that share the generic line-draft workflow (Finish / Delete-last
     buttons, click-or-drag paint via addLineCellLight). */
  const LINE_TOOLS = new Set(Object.keys(LINE_FIELD));
  /* Line tools whose first cell has a distinct meaning (bulb / pillar), so
     the drafter should not close the loop back into it. */
  const LINE_TOOLS_ANCHORED = new Set(['slowThermo']);

  const EXAMPLES = {
    9: [
      5,3,0, 0,7,0, 0,0,0,
      6,0,0, 1,9,5, 0,0,0,
      0,9,8, 0,0,0, 0,6,0,
      8,0,0, 0,6,0, 0,0,3,
      4,0,0, 8,0,3, 0,0,1,
      7,0,0, 0,2,0, 0,0,6,
      0,6,0, 0,0,0, 2,8,0,
      0,0,0, 4,1,9, 0,0,5,
      0,0,0, 0,8,0, 0,7,9,
    ],
    4: [1,0,0,4, 0,0,2,0, 0,3,0,0, 2,0,0,3],
    6: [1,0,0,0,0,6, 0,5,0,1,0,0, 0,0,4,0,0,1, 5,0,0,0,0,4, 0,0,5,6,0,0, 6,0,0,0,0,5],
  };

  /* Module state — one live puzzle at a time. */
  let state;

  function makeState(container) {
    return {
      container,
      puzzle: Core.newPuzzle(9, 3, 3),
      tool: 'digit',
      /* Tool-specific transient selection: */
      regionPick: 0,     /* current region id when painting */
      rainbowPick: 1,    /* current rainbow color (1..N) when painting */
      rainbowDrag: false,
      cageDraft: { cells: [], sum: '' },
      thermoDraft: { cells: [] },
      /* Generic line draft used by whisper / region-sum / modular /
         renban / palindrome / entropic / parityLine tools. */
      lineDraft: { cells: [] },
      /* Arrow tool has two phases: 0 = drawing base pill; 1 = drawing shaft. */
      arrowDraft: { phase: 0, base: [], path: [] },
      /* Quadruple tool: digits pending assignment, next click drops the mark. */
      quadDraft: { digits: '' },
      /* Kropki: current dot type + partial pair. */
      kropkiKind: 'w',
      kropkiFirst: -1,
      /* Compare / XV edge marks — same two-click pattern. */
      compareKind: 'lt',
      compareFirst: -1,
      xvKind: 'x',
      xvFirst: -1,
      /* Parity brush: 1 = odd, 2 = even. */
      parityKind: 1,
      parityDrag: false,
      regionDrag: false,
      pathDrag: false,
      /* Little Killer draft: click-driven placement. lkSelected identifies the
         currently-picked outer edge cell (or null); lkDraft carries the pending
         direction+sum being edited for that cell. */
      lkSelected: null,   /* null | { side, idx } */
      lkDraft: { dir: null, sum: '' },
      lkNotice: '',       /* transient message shown in the panel (e.g. conflict reason) */
      /* Column/Row index paint tools share a drag flag with regionDrag. */
      colIndexDrag: false,
      rowIndexDrag: false,
      /* Hitpoint tool: which direction to toggle when a cell is clicked. */
      hitpointDir: 3,   /* SE by default */
      /* Extra-region draft (multi-cell region, no sum). */
      erDraft: { cells: [] },
      erDrag: null,     /* null | { mode: 'add' | 'remove' } */
      /* Extra-region color index (cycles through the spectra palette). */
      erColor: 0,
      /* Count-circle paint state. */
      ccDrag: null,     /* null | 0 | 1 (drag intent: clear vs. mark) */
      /* Pencilmark analysis */
      pencilmarkOn: false,
      pencilmarkStats: null,   /* { freq: Uint16Array(N*N*(N+1)), maxPerCell: Uint16Array(N*N) } */
      /* Drag state for cage painting. */
      cageDrag: null,    /* null | { mode: 'add' | 'remove' } */
      hoverCageIdx: -1,
      /* Solve state: */
      liveSolve: true,
      solutions: [],
      solutionIdx: 0,
      reachedCap: false,
      /* DOM handles filled by render(): */
      dom: {},
    };
  }

  /* ---------- Small DOM helpers ---------- */
  function el(tag, cls, txt) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (txt != null) n.textContent = txt;
    return n;
  }
  function btn(labelObj, opts = {}) {
    const b = el('button', 'solver-btn' + (opts.secondary ? ' secondary' : ''));
    b._label = labelObj;
    b.textContent = L(labelObj);
    if (opts.onClick) b.addEventListener('click', opts.onClick);
    return b;
  }
  function relocalize(root) {
    root.querySelectorAll('[data-lbl]').forEach(n => { n.textContent = L(T[n.dataset.lbl.split('.')[0]][n.dataset.lbl.split('.')[1]]); });
    root.querySelectorAll('button').forEach(b => { if (b._label) b.textContent = L(b._label); });
  }

  /* ---------- Header controls: sizes + rule flags ---------- */
  function buildSizeControls(host) {
    const wrap = el('div', 'pill-picker');
    const btns = {};
    PRESETS.forEach(p => {
      const b = el('button', 'pill-btn', p.label);
      b.type = 'button';
      b.addEventListener('click', () => {
        state.puzzle = Core.newPuzzle(p.N, p.boxR, p.boxC);
        state.cageDraft = { cells: [], sum: '' };
        state.thermoDraft = { cells: [] };
        state.lineDraft = { cells: [] };
        state.arrowDraft = { phase: 0, base: [], path: [] };
        state.quadDraft = { digits: '' };
        state.kropkiFirst = -1;
        state.compareFirst = -1;
        state.xvFirst = -1;
        state.rainbowPick = 1;
        state.lkSelected = null;
        state.lkDraft = { dir: null, sum: '' };
        state.lkNotice = '';
        state.pencilmarkOn = false;
        state.pencilmarkStats = null;
        rebuild();
      });
      btns[p.label] = b;
      wrap.appendChild(b);
    });
    host.appendChild(wrap);

    const custom = el('div', 'size-controls');
    custom.append(
      el('span', null, 'Custom: '),
    );
    const boxR = el('input');
    boxR.type = 'number'; boxR.min = 1; boxR.max = 4; boxR.value = state.puzzle.boxR;
    const boxC = el('input');
    boxC.type = 'number'; boxC.min = 1; boxC.max = 4; boxC.value = state.puzzle.boxC;
    const info = el('span', 'hint');
    function refreshInfo() {
      const A = Number(boxR.value) | 0, B = Number(boxC.value) | 0;
      const N = A * B;
      info.textContent = (N >= MIN_N && N <= MAX_N)
        ? `→ ${N}×${N}`
        : `→ ${N}× (must be ${MIN_N}..${MAX_N})`;
    }
    boxR.addEventListener('input', refreshInfo);
    boxC.addEventListener('input', refreshInfo);
    const apply = btn({ en: 'Apply', zh: '应用' }, {
      secondary: true,
      onClick: () => {
        const A = Number(boxR.value) | 0, B = Number(boxC.value) | 0;
        const N = A * B;
        if (N < MIN_N || N > MAX_N) return;
        state.puzzle = Core.newPuzzle(N, A, B);
        state.cageDraft = { cells: [], sum: '' };
        state.thermoDraft = { cells: [] };
        state.lineDraft = { cells: [] };
        state.arrowDraft = { phase: 0, base: [], path: [] };
        state.quadDraft = { digits: '' };
        state.kropkiFirst = -1;
        state.compareFirst = -1;
        state.xvFirst = -1;
        state.rainbowPick = 1;
        state.lkSelected = null;
        state.lkDraft = { dir: null, sum: '' };
        state.lkNotice = '';
        state.pencilmarkOn = false;
        state.pencilmarkStats = null;
        rebuild();
      },
    });
    custom.append(
      el('span', null, 'A='), boxR,
      el('span', null, '× B='), boxC,
      info, apply,
    );
    host.appendChild(custom);
    refreshInfo();

    /* Highlight the matching preset. */
    PRESETS.forEach(p => {
      const active = (p.N === state.puzzle.N && p.boxR === state.puzzle.boxR && p.boxC === state.puzzle.boxC);
      btns[p.label].classList.toggle('active', active);
    });
  }

  function buildFlagRow(host) {
    const row = el('div', 'flag-row');
    Object.keys(T.flag).forEach(k => {
      const chip = el('button', 'flag-chip');
      chip._label = T.flag[k];
      chip.textContent = L(T.flag[k]);
      chip.classList.toggle('active', !!state.puzzle.flags[k]);
      /* Disjoint groups depend on rectangular boxes: with jigsaw regions the
         "position within a box" is not well defined. Grey the chip out when
         jigsaw regions are present, and refuse to activate. */
      if (k === 'disjoint' && hasCustomRegions()) {
        chip.disabled = true;
        chip.classList.remove('active');
        chip.title = L({
          en: 'Disjoint groups are incompatible with jigsaw regions — reset regions to boxes first.',
          zh: '同位置组与异形宫互斥 — 请先将宫格恢复为矩形。',
        });
      }
      chip.addEventListener('click', () => {
        if (chip.disabled) return;
        state.puzzle.flags[k] = !state.puzzle.flags[k];
        /* Turning on disjoint while jigsaw is active would silently produce
           an infeasible puzzle — that path is blocked at the setter level via
           the disabled check above and the region painter (see paintRegionLight).
           The chip does not need to touch other flags. */
        chip.classList.toggle('active', state.puzzle.flags[k]);
        analyze();
      });
      row.appendChild(chip);
    });
    host.appendChild(row);
  }

  /* Tool tabs are grouped by category so related tools sit on the same row.
     Each group renders as its own centered pill row inside `.tool-tabs-wrap`. */
  const TOOL_GROUPS = [
    { label: { en: 'Basic',      zh: '基础'   }, tools: ['digit', 'region', 'rainbow', 'cage', 'extraRegion', 'grid'] },
    { label: { en: 'Lines',      zh: '线约束' }, tools: ['thermo', 'slowThermo', 'whisper', 'regionSum', 'modular', 'renban', 'palindrome', 'entropic', 'parityLine', 'between', 'lockout', 'sequence'] },
    { label: { en: 'Arrows',     zh: '箭头'   }, tools: ['arrow', 'hitpoint'] },
    { label: { en: 'Edge clues', zh: '外圈线索' }, tools: ['sky', 'sandwich', 'littleKiller', 'xsum'] },
    { label: { en: 'Edge marks', zh: '边标记' }, tools: ['kropki', 'compare', 'xv'] },
    { label: { en: 'Point marks',zh: '点标记' }, tools: ['quadruple'] },
    { label: { en: 'Cell marks', zh: '格子标记' }, tools: ['parity', 'colIndex', 'rowIndex', 'countCircle'] },
  ];

  function buildToolTabs(host) {
    const wrap = el('div', 'tool-tabs-wrap');
    state.dom.tabs = {};
    TOOL_GROUPS.forEach(group => {
      const row = el('div', 'tool-tabs');
      const lbl = el('span', 'tab-group-label');
      lbl._label = group.label;
      lbl.textContent = L(group.label);
      row.appendChild(lbl);
      group.tools.forEach(k => {
        const b = el('button', 'tool-tab');
        b._label = T.tab[k];
        b.textContent = L(T.tab[k]);
        b.classList.toggle('active', state.tool === k);
        b.addEventListener('click', () => {
          /* Leaving the Little Killer tool clears its transient selection so
             the outer-edge slot doesn't stay in its "selected" state when the
             user comes back. */
          if (state.tool === 'littleKiller' && k !== 'littleKiller') {
            state.lkSelected = null;
            state.lkDraft = { dir: null, sum: '' };
            state.lkNotice = '';
          }
          state.tool = k;
          rebuildToolUI();
        });
        row.appendChild(b);
        state.dom.tabs[k] = b;
      });
      wrap.appendChild(row);
    });
    host.appendChild(wrap);
  }

  function buildToolPanel(host) {
    const panel = el('div', 'tool-panel');
    state.dom.toolPanel = panel;
    host.appendChild(panel);
    fillToolPanel();
  }

  function fillToolPanel() {
    const p = state.dom.toolPanel;
    p.innerHTML = '';
    const hint = el('div', 'hint', L(T.hint[state.tool]));
    hint.style.flex = '1 1 100%';
    hint.style.textAlign = 'center';
    p.appendChild(hint);

    if (state.tool === 'region')    fillRegionPanel(p);
    if (state.tool === 'rainbow')   fillRainbowPanel(p);
    if (state.tool === 'cage')      fillCagePanel(p);
    if (state.tool === 'thermo')    fillThermoPanel(p);
    if (state.tool === 'sky')       fillSkyPanel(p);
    if (state.tool === 'sandwich')  fillSandwichPanel(p);
    if (LINE_TOOLS.has(state.tool)) fillLinePanel(p);
    if (state.tool === 'arrow')     fillArrowPanel(p);
    if (state.tool === 'quadruple') fillQuadruplePanel(p);
    if (state.tool === 'kropki')    fillKropkiPanel(p);
    if (state.tool === 'compare')   fillComparePanel(p);
    if (state.tool === 'xv')        fillXVPanel(p);
    if (state.tool === 'parity')    fillParityPanel(p);
    if (state.tool === 'littleKiller') fillLittleKillerPanel(p);
    if (state.tool === 'colIndex')  fillColIndexPanel(p);
    if (state.tool === 'rowIndex')  fillRowIndexPanel(p);
    if (state.tool === 'hitpoint')  fillHitpointPanel(p);
    if (state.tool === 'extraRegion') fillExtraRegionPanel(p);
    if (state.tool === 'xsum')      fillXSumPanel(p);
    if (state.tool === 'countCircle') fillCountCirclePanel(p);
    if (state.tool === 'grid')      fillGridPanel(p);
  }

  function fillGridPanel(p) {
    const pz = state.puzzle;
    const nRows = pz.rows != null ? pz.rows : pz.N;
    const nCols = pz.cols != null ? pz.cols : pz.N;
    const digits = pz.digits != null ? pz.digits : pz.N;
    const existing = countExistingCells(pz);
    const defaultRegionCount = digits ? Math.floor(existing / digits) : 0;
    const regionCount = pz.regionCount != null ? pz.regionCount : defaultRegionCount;
    /* Inputs are read on Apply — editing them doesn't rebuild until then,
       so the user can iterate without losing state. */
    const rowsInp = el('input');
    rowsInp.type = 'number'; rowsInp.min = 2; rowsInp.max = 16; rowsInp.value = nRows;
    rowsInp.style.width = '4rem';
    const colsInp = el('input');
    colsInp.type = 'number'; colsInp.min = 2; colsInp.max = 16; colsInp.value = nCols;
    colsInp.style.width = '4rem';
    const digitsInp = el('input');
    digitsInp.type = 'number'; digitsInp.min = 2; digitsInp.max = 16; digitsInp.value = digits;
    digitsInp.style.width = '4rem';
    const regionsInp = el('input');
    regionsInp.type = 'number'; regionsInp.min = 1; regionsInp.max = 32; regionsInp.value = regionCount;
    regionsInp.style.width = '4rem';
    p.append(
      el('span', null, L({ en: 'Rows', zh: '行' }) + ':'), rowsInp,
      el('span', null, '× ' + L({ en: 'Cols', zh: '列' }) + ':'), colsInp,
      el('span', null, ' · ' + L({ en: 'Digits', zh: '数字' }) + ':'), digitsInp,
      el('span', null, ' · ' + L({ en: 'Regions', zh: '宫格数' }) + ':'), regionsInp,
    );
    p.appendChild(btn({ en: 'Apply', zh: '应用' }, {
      onClick: () => {
        const R  = Number(rowsInp.value) | 0;
        const C  = Number(colsInp.value) | 0;
        const D  = Number(digitsInp.value) | 0;
        const RG = Number(regionsInp.value) | 0;
        if (R < 2 || R > 16 || C < 2 || C > 16 || D < 2 || D > 16 || RG < 1) return;
        applyGridShape(R, C, D, RG);
      },
    }));
    p.appendChild(btn({ en: 'Reset shape', zh: '重置形状' }, {
      secondary: true,
      onClick: () => {
        const N = pz.N;
        applyGridShape(N, N, N, N);
      },
    }));
    const del = (pz.deleted && Array.prototype.filter.call(pz.deleted, x => x).length) || 0;
    /* Feasibility check — regions × digits must equal existing cells for
       a valid puzzle. Warn the user directly on the panel so they don't
       have to run the solver to discover the mismatch. */
    const feasible = (regionCount * digits) === existing;
    const hint = el('span', 'hint');
    hint.textContent = L({
      en: `Deleted: ${del} · Existing: ${existing} · Regions × Digits = ${regionCount * digits}${feasible ? ' ✓' : ` (should equal ${existing})`}`,
      zh: `已删除：${del} · 现有：${existing} · 宫格数 × 数字数 = ${regionCount * digits}${feasible ? ' ✓' : `（应等于 ${existing}）`}`,
    });
    if (!feasible) hint.style.color = 'var(--danger, #dc2626)';
    hint.style.flex = '1 1 100%';
    hint.style.textAlign = 'center';
    p.appendChild(hint);
  }

  function countExistingCells(pz) {
    const nRows = pz.rows != null ? pz.rows : pz.N;
    const nCols = pz.cols != null ? pz.cols : pz.N;
    const total = nRows * nCols;
    if (!pz.deleted) return total;
    let n = 0;
    for (let i = 0; i < total; i++) if (!pz.deleted[i]) n++;
    return n;
  }

  /* Apply new rows/cols/digits/regionCount, preserving as much of the
     current puzzle as fits. Deleted cells stay deleted when the shape
     only shrinks in a dimension the deleted cell falls outside of. */
  function applyGridShape(rows, cols, digits, regionCount) {
    const oldP = state.puzzle;
    const oldRows = oldP.rows != null ? oldP.rows : oldP.N;
    const oldCols = oldP.cols != null ? oldP.cols : oldP.N;
    const boxR = oldP.boxR || 3, boxC = oldP.boxC || 3;
    /* Carry over the deleted bitmap where it still fits. */
    const carry = new Uint8Array(rows * cols);
    if (oldP.deleted) {
      for (let r = 0; r < Math.min(rows, oldRows); r++) {
        for (let c = 0; c < Math.min(cols, oldCols); c++) {
          if (oldP.deleted[r * oldCols + c]) carry[r * cols + c] = 1;
        }
      }
    }
    state.puzzle = Core.newPuzzle(digits, boxR, boxC, {
      rows, cols, digits, deleted: carry,
      regionCount: regionCount != null ? regionCount : undefined,
    });
    /* Clear all drafts. */
    state.cageDraft = { cells: [], sum: '' };
    state.thermoDraft = { cells: [] };
    state.lineDraft = { cells: [] };
    state.arrowDraft = { phase: 0, base: [], path: [] };
    state.quadDraft = { digits: '' };
    state.kropkiFirst = -1;
    state.compareFirst = -1;
    state.xvFirst = -1;
    state.rainbowPick = 1;
    state.lkSelected = null;
    state.lkDraft = { dir: null, sum: '' };
    state.lkNotice = '';
    state.pencilmarkOn = false;
    state.pencilmarkStats = null;
    /* If any cell is deleted, the default rectangular regions are wrong —
       jump the user straight to the region editor. */
    if (Array.prototype.some.call(carry, v => v)) state.tool = 'region';
    rebuild();
  }

  function toggleDeletedCell(i) {
    const pz = state.puzzle;
    if (!pz.deleted) return;
    /* If the grid was still classic (default rectangular box regions, no
       holes), the moment we introduce a hole the box layout stops making
       sense — remaining regions won't tile cleanly. Clear every region
       assignment so the user paints them fresh in the Region editor,
       which is exactly the "irregular = no default boxes" contract. */
    const nRows = pz.rows != null ? pz.rows : pz.N;
    const nCols = pz.cols != null ? pz.cols : pz.N;
    const total = nRows * nCols;
    const stillClassic = !anyDeleted(pz)
      && nRows === nCols && nRows === pz.N
      && pz.boxR && pz.boxC && nRows % pz.boxR === 0 && nCols % pz.boxC === 0;
    if (stillClassic) {
      /* First deletion — wipe all default regions to -1. */
      for (let k = 0; k < total; k++) pz.regions[k] = -1;
    }
    pz.deleted[i] = pz.deleted[i] ? 0 : 1;
    /* Recompute the region count from existing / digits so the region
       picker offers the right number of chips. Preserves user override
       only when the arithmetic still works. */
    let existing = 0;
    for (let k = 0; k < total; k++) if (!pz.deleted[k]) existing++;
    if (pz.digits) pz.regionCount = Math.max(0, Math.floor(existing / pz.digits));
    if (pz.deleted[i]) {
      /* Clean up references to this cell. */
      pz.values[i] = 0;
      pz.given[i] = 0;
      pz.regions[i] = -1;
      if (pz.parity) pz.parity[i] = 0;
      if (pz.rainbow) pz.rainbow[i] = 0;
      if (pz.colIndex) pz.colIndex[i] = 0;
      if (pz.rowIndex) pz.rowIndex[i] = 0;
      if (pz.countCircles) pz.countCircles[i] = 0;
      const dropFromCells = (arr) => arr.filter(entry => !entry.cells.includes(i));
      const dropFromLines = (arr) => arr.map(l => l.filter(x => x !== i)).filter(l => l.length >= 2);
      pz.cages = dropFromCells(pz.cages);
      pz.thermos     = dropFromLines(pz.thermos);
      pz.whispers    = dropFromLines(pz.whispers   || []);
      pz.regionSums  = dropFromLines(pz.regionSums || []);
      pz.modulars    = dropFromLines(pz.modulars   || []);
      pz.renbans     = dropFromLines(pz.renbans    || []);
      pz.palindromes = dropFromLines(pz.palindromes|| []);
      pz.entropics   = dropFromLines(pz.entropics  || []);
      pz.parityLines = dropFromLines(pz.parityLines|| []);
      pz.betweenLines= dropFromLines(pz.betweenLines|| []);
      pz.slowThermos = dropFromLines(pz.slowThermos|| []);
      pz.lockoutLines= dropFromLines(pz.lockoutLines|| []);
      pz.sequenceLines=dropFromLines(pz.sequenceLines|| []);
      pz.kropki  = (pz.kropki  || []).filter(d => d.a !== i && d.b !== i);
      pz.compare = (pz.compare || []).filter(d => d.a !== i && d.b !== i);
      pz.xv      = (pz.xv      || []).filter(d => d.a !== i && d.b !== i);
      pz.arrows  = (pz.arrows  || []).filter(a => !a.base.includes(i) && !a.path.includes(i));
      pz.hitpoints=(pz.hitpoints||[]).filter(h => h.cell !== i);
      pz.extraRegions=(pz.extraRegions||[]).map(er => ({ cells: er.cells.filter(x => x !== i) })).filter(er => er.cells.length);
    }
    rebuild();
  }

  /* Shared: a chip button with a swatch element for pair/parity pickers. */
  function chipButton(active, swatchCls, label, onClick) {
    const chip = el('button', 'chip' + (active ? ' active' : ''));
    chip._label = label;
    if (swatchCls) {
      const sw = el('span', swatchCls);
      chip.appendChild(sw);
    }
    chip.appendChild(document.createTextNode(L(label)));
    chip.addEventListener('click', onClick);
    return chip;
  }

  function fillComparePanel(p) {
    [
      { kind: 'lt', label: T.cmpLt, sw: 'cmp-swatch lt' },
      { kind: 'gt', label: T.cmpGt, sw: 'cmp-swatch gt' },
    ].forEach(({ kind, label, sw }) => {
      p.appendChild(chipButton(state.compareKind === kind, sw, label, () => {
        state.compareKind = kind;
        state.compareFirst = -1;
        fillToolPanel();
        drawCompare();
      }));
    });
    p.appendChild(el('span', null,
      L({ en: `Marks: ${state.puzzle.compare.length}`, zh: `标记数：${state.puzzle.compare.length}` })));
    if (state.puzzle.compare.length) {
      p.appendChild(btn(T.clearCmp, {
        secondary: true,
        onClick: () => { state.puzzle.compare = []; rebuild(); },
      }));
    }
  }

  function fillXVPanel(p) {
    [
      { kind: 'x', label: T.xvX, sw: 'xv-swatch x' },
      { kind: 'v', label: T.xvV, sw: 'xv-swatch v' },
    ].forEach(({ kind, label, sw }) => {
      p.appendChild(chipButton(state.xvKind === kind, sw, label, () => {
        state.xvKind = kind;
        state.xvFirst = -1;
        fillToolPanel();
        drawXV();
      }));
    });
    p.appendChild(el('span', null,
      L({ en: `Marks: ${state.puzzle.xv.length}`, zh: `标记数：${state.puzzle.xv.length}` })));
    if (state.puzzle.xv.length) {
      p.appendChild(btn(T.clearXV, {
        secondary: true,
        onClick: () => { state.puzzle.xv = []; rebuild(); },
      }));
    }
  }

  function fillParityPanel(p) {
    [
      { kind: 1, label: T.parOdd,  sw: 'par-swatch odd'  },
      { kind: 2, label: T.parEven, sw: 'par-swatch even' },
    ].forEach(({ kind, label, sw }) => {
      p.appendChild(chipButton(state.parityKind === kind, sw, label, () => {
        state.parityKind = kind;
        fillToolPanel();
      }));
    });
    const total = state.puzzle.parity.reduce((n, v) => n + (v ? 1 : 0), 0);
    p.appendChild(el('span', null,
      L({ en: `Marks: ${total}`, zh: `标记数：${total}` })));
    if (total) {
      p.appendChild(btn(T.clearParity, {
        secondary: true,
        onClick: () => { state.puzzle.parity.fill(0); rebuild(); },
      }));
    }
  }

  function fillSandwichPanel(p) {
    const sw = state.puzzle.sandwich;
    const total = ['top', 'bottom', 'left', 'right']
      .reduce((n, side) => n + Array.prototype.filter.call(sw[side], v => !!v).length, 0);
    p.appendChild(el('span', null,
      L({ en: `Clues set: ${total}`, zh: `已设线索：${total}` })));
    p.appendChild(btn({ en: 'Clear all clues', zh: '清空全部线索' }, {
      secondary: true,
      onClick: () => {
        sw.top.fill(0); sw.bottom.fill(0); sw.left.fill(0); sw.right.fill(0);
        rebuild();
      },
    }));
  }

  function fillLinePanel(p) {
    const draft = state.lineDraft;
    const field = LINE_FIELD[state.tool];
    p.appendChild(el('span', null,
      L({ en: `Path length: ${draft.cells.length}`,
          zh: `路径长度：${draft.cells.length}` })));
    p.appendChild(btn(T.finishLine, { onClick: finishLine }));
    if (draft.cells.length) {
      p.appendChild(btn(T.delSel, {
        secondary: true,
        onClick: () => { draft.cells.pop(); rebuild(); },
      }));
    }
    const existing = (state.puzzle[field] || []).length;
    if (existing) {
      p.appendChild(btn(T.delLine, {
        secondary: true,
        onClick: () => { state.puzzle[field].pop(); rebuild(); },
      }));
    }
  }

  function fillKropkiPanel(p) {
    const kinds = [
      { kind: 'w', label: T.dotWhite },
      { kind: 'b', label: T.dotBlack },
    ];
    kinds.forEach(({ kind, label }) => {
      const chip = el('button', 'chip');
      chip._label = label;
      const sw = el('span', 'kdot-swatch ' + (kind === 'w' ? 'w' : 'b'));
      chip.appendChild(sw);
      chip.appendChild(document.createTextNode(L(label)));
      chip.classList.toggle('active', state.kropkiKind === kind);
      chip.addEventListener('click', () => {
        state.kropkiKind = kind;
        state.kropkiFirst = -1;
        fillToolPanel();
        drawKropki();
      });
      p.appendChild(chip);
    });
    p.appendChild(el('span', null,
      L({ en: `Dots: ${state.puzzle.kropki.length}`,
          zh: `点数：${state.puzzle.kropki.length}` })));
    if (state.puzzle.kropki.length) {
      p.appendChild(btn(T.clearDots, {
        secondary: true,
        onClick: () => { state.puzzle.kropki = []; rebuild(); },
      }));
    }
  }

  function finishLine() {
    const field = LINE_FIELD[state.tool];
    if (!field) return;
    if (state.lineDraft.cells.length < 2) return;
    state.puzzle[field].push([...state.lineDraft.cells]);
    state.lineDraft = { cells: [] };
    rebuild();
  }

  function fillArrowPanel(p) {
    const draft = state.arrowDraft;
    p.appendChild(el('span', null,
      L({ en: `Phase: ${draft.phase === 0 ? 'Base pill' : 'Shaft'} — base=${draft.base.length}, shaft=${draft.path.length}`,
          zh: `阶段：${draft.phase === 0 ? '圆圈胶囊' : '箭杆'} — 圆圈=${draft.base.length}，箭杆=${draft.path.length}` })));
    if (draft.phase === 0) {
      p.appendChild(btn({ en: 'Next: shaft', zh: '下一步：箭杆' }, {
        onClick: () => {
          if (!draft.base.length) return;
          draft.phase = 1;
          rebuild();
        },
      }));
    } else {
      p.appendChild(btn({ en: 'Back: base', zh: '返回：圆圈' }, {
        secondary: true,
        onClick: () => { draft.phase = 0; rebuild(); },
      }));
      p.appendChild(btn({ en: 'Finish arrow', zh: '完成箭头' }, { onClick: finishArrow }));
    }
    p.appendChild(btn({ en: 'Cancel', zh: '取消' }, {
      secondary: true,
      onClick: () => { state.arrowDraft = { phase: 0, base: [], path: [] }; rebuild(); },
    }));
    if (state.puzzle.arrows.length) {
      p.appendChild(btn({ en: 'Delete last arrow', zh: '删除上一箭头' }, {
        secondary: true,
        onClick: () => { state.puzzle.arrows.pop(); rebuild(); },
      }));
    }
  }

  function finishArrow() {
    const d = state.arrowDraft;
    if (!d.base.length || !d.path.length) return;
    state.puzzle.arrows.push({ base: [...d.base], path: [...d.path] });
    state.arrowDraft = { phase: 0, base: [], path: [] };
    rebuild();
  }

  /* Arrow painting: append a cell to whichever phase the draft is in.
     Base cells must be orthogonally adjacent (they form a pill). Shaft
     cells may step orthogonally or diagonally (like other lines). */
  function addArrowCell(i) { addArrowCellLight(i); }
  function addArrowCellLight(i) {
    const N = state.puzzle.N;
    const d = state.arrowDraft;
    const arr = d.phase === 0 ? d.base : d.path;
    if (arr.length === 0) { arr.push(i); refreshPathOverlays(); return; }
    if (arr[arr.length - 1] === i) return;
    if (arr.indexOf(i) !== -1) return;
    /* Base and path may not overlap. */
    if (d.phase === 0 && d.path.indexOf(i) !== -1) return;
    if (d.phase === 1 && d.base.indexOf(i) !== -1) return;
    const prev = arr[arr.length - 1];
    const dr = Math.abs(((i / N) | 0) - ((prev / N) | 0));
    const dc = Math.abs((i % N) - (prev % N));
    if (d.phase === 0) {
      /* Base pill: orthogonal only, max 3 cells so it stays a short number. */
      if (dr + dc === 1 && arr.length < 3) { arr.push(i); refreshPathOverlays(); }
    } else {
      if (dr <= 1 && dc <= 1 && (dr + dc) > 0) { arr.push(i); refreshPathOverlays(); }
    }
  }

  function fillQuadruplePanel(p) {
    const draft = state.quadDraft;
    p.appendChild(el('span', null, L({ en: 'Digits', zh: '数字' }) + ':'));
    const input = el('input');
    input.type = 'text';
    input.value = draft.digits;
    input.placeholder = 'e.g. 1234';
    input.maxLength = state.puzzle.N;
    input.addEventListener('input', () => { draft.digits = input.value; });
    p.appendChild(input);
    p.appendChild(el('span', null,
      L({ en: `Placed: ${state.puzzle.quadruples.length}`,
          zh: `已放置：${state.puzzle.quadruples.length}` })));
    if (state.puzzle.quadruples.length) {
      p.appendChild(btn({ en: 'Delete last', zh: '删除最后一个' }, {
        secondary: true,
        onClick: () => { state.puzzle.quadruples.pop(); rebuild(); },
      }));
      p.appendChild(btn({ en: 'Clear all', zh: '清空全部' }, {
        secondary: true,
        onClick: () => { state.puzzle.quadruples = []; rebuild(); },
      }));
    }
  }

  /* Quadruple click: the clicked cell becomes the top-left of the 2×2, so the
     mark sits at the intersection (r+1, c+1). Clicking the same intersection
     again clears it. Rejects placements at the grid's bottom or right edge. */
  function handleQuadClick(i) {
    const N = state.puzzle.N;
    const r = (i / N) | 0, c = i % N;
    /* The mark's corner is (r+1, c+1). Must be strictly inside the grid. */
    const qr = r + 1, qc = c + 1;
    if (qr <= 0 || qr >= N || qc <= 0 || qc >= N) return;
    const digits = parseQuadDigits(state.quadDraft.digits, N);
    if (!digits.length) return;
    const list = state.puzzle.quadruples;
    const found = list.findIndex(q => q.r === qr && q.c === qc);
    if (found >= 0) {
      /* Same corner: replace if digits differ, else remove. */
      const cur = list[found];
      if (arraysEqual(cur.digits, digits)) list.splice(found, 1);
      else cur.digits = digits;
    } else {
      list.push({ r: qr, c: qc, digits });
    }
    rebuild();
  }
  function parseQuadDigits(s, N) {
    const seen = new Set();
    const out = [];
    for (const ch of String(s || '').toUpperCase()) {
      const v = charToDigit(ch);
      if (v >= 1 && v <= N && !seen.has(v)) { seen.add(v); out.push(v); if (out.length >= 4) break; }
    }
    return out;
  }
  function arraysEqual(a, b) {
    if (a.length !== b.length) return false;
    for (let k = 0; k < a.length; k++) if (a[k] !== b[k]) return false;
    return true;
  }

  /* ---------- Little Killer tool ---------- */
  const LK_SIDES = [
    { key: 'top',    en: 'Top',    zh: '顶' },
    { key: 'bottom', en: 'Bottom', zh: '底' },
    { key: 'left',   en: 'Left',   zh: '左' },
    { key: 'right',  en: 'Right',  zh: '右' },
  ];
  const LK_DIRS = [
    { key: 'dr', glyph: '↘', en: 'Down-Right', zh: '右下' },
    { key: 'dl', glyph: '↙', en: 'Down-Left',  zh: '左下' },
    { key: 'ur', glyph: '↗', en: 'Up-Right',   zh: '右上' },
    { key: 'ul', glyph: '↖', en: 'Up-Left',    zh: '左上' },
  ];
  /* Directions that go INTO the grid from each side. Corners further reduce
     this to a single direction (degenerate 1-cell diagonals are filtered out
     by checking diagCells length >= 2). */
  const LK_VALID_DIRS = {
    top:    ['dr', 'dl'],
    bottom: ['ur', 'ul'],
    left:   ['dr', 'ur'],
    right:  ['dl', 'ul'],
  };

  function lkDiagCells(side, idx, dir, N) {
    if (!self.LittleKillerHelpers) return [];
    return self.LittleKillerHelpers.diagCells(side, idx, dir, N);
  }
  /* Directions whose diagonal has ≥ 2 cells from (side, idx). Excludes the
     one-cell degenerate case at corners (e.g. top idx 0 direction 'dl'). */
  function lkDirsAt(side, idx, N) {
    return LK_VALID_DIRS[side].filter(d => lkDiagCells(side, idx, d, N).length >= 2);
  }
  /* Return existing arrows anchored at (side, idx). */
  function lkArrowsAt(side, idx) {
    return (state.puzzle.littleKillers || [])
      .map((lk, i) => ({ lk, i }))
      .filter(x => x.lk.side === side && x.lk.idx === idx);
  }
  /* Sorted-tuple key for a diagonal, for conflict detection: two anchors
     may describe the same diagonal (each end of the line), so we compare
     the cell sets rather than the (side, idx, dir) triple. */
  function lkCellsKey(cells) {
    return cells.slice().sort((a, b) => a - b).join(',');
  }
  /* Find an existing arrow whose diagonal (as a cell set) equals `cells`. */
  function lkFindByCells(cells) {
    const key = lkCellsKey(cells);
    const N = state.puzzle.N;
    const list = state.puzzle.littleKillers || [];
    for (let i = 0; i < list.length; i++) {
      const lk = list[i];
      if (lkCellsKey(lkDiagCells(lk.side, lk.idx, lk.dir, N)) === key) return i;
    }
    return -1;
  }

  /* Panel: click-driven. When a cell is selected, show direction+sum controls;
     otherwise show a hint plus global maintenance buttons. */
  function fillLittleKillerPanel(p) {
    const N = state.puzzle.N;
    const sel = state.lkSelected;
    const list = state.puzzle.littleKillers || [];

    if (!sel) {
      p.appendChild(el('span', null,
        L({ en: 'Click any outer edge cell to add or edit an arrow.',
            zh: '点击网格外圈任一格以添加或编辑箭头。' })));
      p.appendChild(el('span', null,
        L({ en: `Arrows: ${list.length}`, zh: `箭头数：${list.length}` })));
      if (list.length) {
        p.appendChild(btn({ en: 'Delete last', zh: '删除最后' }, {
          secondary: true,
          onClick: () => { list.pop(); rebuild(); },
        }));
        p.appendChild(btn({ en: 'Clear all', zh: '清空全部' }, {
          secondary: true,
          onClick: () => { state.puzzle.littleKillers = []; rebuild(); },
        }));
      }
      return;
    }

    const d = state.lkDraft;
    const validDirs = lkDirsAt(sel.side, sel.idx, N);
    if (!validDirs.length) {
      /* Shouldn't happen: outer cells with no valid diagonal aren't clickable,
         but guard anyway so an inconsistent state doesn't leave the panel stuck. */
      state.lkSelected = null;
      p.appendChild(el('span', null,
        L({ en: 'No diagonal available here.', zh: '此处无可用对角线。' })));
      return;
    }
    if (!validDirs.includes(d.dir)) d.dir = validDirs[0];

    const sideName = LK_SIDES.find(s => s.key === sel.side);
    const posN = (sel.idx | 0) + 1;
    p.appendChild(el('span', null,
      L({ en: `Anchor: ${sideName.en} #${posN}`,
          zh: `锚点：${sideName.zh} 第 ${posN} 格` })));

    const existing = lkArrowsAt(sel.side, sel.idx);
    if (existing.length) {
      p.appendChild(el('span', null,
        L({ en: 'Existing here:', zh: '此处已有：' })));
      existing.forEach(({ lk, i }) => {
        const dir = LK_DIRS.find(x => x.key === lk.dir);
        const chip = el('button', 'chip lk-existing');
        chip.textContent = `${dir ? dir.glyph : '?'} ${lk.sum} ×`;
        chip.title = L({ en: 'Click to delete this arrow', zh: '点击删除此箭头' });
        chip.addEventListener('click', () => {
          state.puzzle.littleKillers.splice(i, 1);
          state.lkNotice = '';
          rebuild();
        });
        p.appendChild(chip);
      });
    }

    p.appendChild(el('span', null, L({ en: 'Dir', zh: '方向' }) + ':'));
    LK_DIRS.forEach(dir => {
      const enabled = validDirs.includes(dir.key);
      const chip = el('button', 'chip' + (d.dir === dir.key ? ' active' : ''));
      chip.textContent = dir.glyph;
      chip.title = L({ en: dir.en, zh: dir.zh });
      chip.disabled = !enabled;
      if (!enabled) chip.style.opacity = '0.3';
      chip.addEventListener('click', () => {
        if (!enabled) return;
        d.dir = dir.key;
        state.lkNotice = '';
        fillToolPanel();
      });
      p.appendChild(chip);
    });

    p.appendChild(el('span', null, L(T.sumLbl) + ':'));
    const sumIn = el('input');
    sumIn.type = 'number'; sumIn.min = 1;
    sumIn.value = d.sum;
    sumIn.placeholder = '—';
    sumIn.style.width = '5rem';
    sumIn.addEventListener('input', () => {
      d.sum = sumIn.value;
      state.lkNotice = '';
    });
    sumIn.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); tryAddLK(); }
    });
    p.appendChild(sumIn);

    p.appendChild(btn({ en: 'Add', zh: '添加' }, { onClick: tryAddLK }));
    p.appendChild(btn({ en: 'Deselect', zh: '取消选中' }, {
      secondary: true,
      onClick: () => {
        state.lkSelected = null;
        state.lkDraft = { dir: null, sum: '' };
        state.lkNotice = '';
        rebuild();
      },
    }));

    if (state.lkNotice) {
      const msg = el('span', 'lk-notice');
      msg.textContent = state.lkNotice;
      msg.style.color = 'var(--err, #d33)';
      msg.style.flex = '1 1 100%';
      msg.style.textAlign = 'center';
      p.appendChild(msg);
    }
  }

  /* Add-arrow action, extracted so both the button and Enter-in-sum can call it. */
  function tryAddLK() {
    const N = state.puzzle.N;
    const sel = state.lkSelected;
    const d = state.lkDraft;
    if (!sel) return;
    const sum = Number(d.sum);
    if (!Number.isFinite(sum) || sum <= 0) {
      state.lkNotice = L({ en: 'Enter a positive sum first.',
                            zh: '请先输入正整数总和。' });
      fillToolPanel();
      return;
    }
    const validDirs = lkDirsAt(sel.side, sel.idx, N);
    if (!validDirs.includes(d.dir)) {
      state.lkNotice = L({ en: 'Pick a valid direction.',
                            zh: '请选择一个有效方向。' });
      fillToolPanel();
      return;
    }
    const cells = lkDiagCells(sel.side, sel.idx, d.dir, N);
    if (cells.length < 2) {
      state.lkNotice = L({ en: 'This direction has no diagonal.',
                            zh: '此方向没有有效对角线。' });
      fillToolPanel();
      return;
    }
    /* Both ends of the same diagonal describe an identical cell set; refuse
       to add if any existing arrow (from either end) already covers it. */
    const dup = lkFindByCells(cells);
    if (dup >= 0) {
      const other = state.puzzle.littleKillers[dup];
      const sideName = LK_SIDES.find(s => s.key === other.side);
      state.lkNotice = L({
        en: `Same diagonal already has an arrow (${sideName.en} #${(other.idx | 0) + 1}, sum ${other.sum}).`,
        zh: `同一对角线已存在箭头（${sideName.zh} 第 ${(other.idx | 0) + 1} 格，总和 ${other.sum}）。`,
      });
      fillToolPanel();
      return;
    }
    state.puzzle.littleKillers.push({
      side: sel.side, idx: sel.idx | 0, dir: d.dir, sum,
    });
    state.lkDraft.sum = '';
    state.lkNotice = '';
    rebuild();
  }

  /* ---------- Column / Row Index tools ---------- */
  function fillIndexPanelShared(p, arrayKey, labelObj) {
    const N = state.puzzle.N;
    const arr = state.puzzle[arrayKey] || new Int8Array(N * N);
    let total = 0;
    for (let i = 0; i < arr.length; i++) if (arr[i]) total++;
    p.appendChild(el('span', null,
      L({ en: `Marked: ${total}`, zh: `已标记：${total}` })));
    p.appendChild(btn({ en: 'Select all', zh: '全选' }, {
      onClick: () => {
        for (let i = 0; i < arr.length; i++) arr[i] = 1;
        rebuild();
      },
    }));
    if (total) {
      p.appendChild(btn({ en: 'Clear all', zh: '清空全部' }, {
        secondary: true,
        onClick: () => { arr.fill(0); rebuild(); },
      }));
    }
  }
  function fillColIndexPanel(p) { fillIndexPanelShared(p, 'colIndex'); }
  function fillRowIndexPanel(p) { fillIndexPanelShared(p, 'rowIndex'); }

  /* ---------- Hitpoint Arrow tool ---------- */
  const HITPOINT_DIRS = [
    { bit: 0, glyph: '↑',  en: 'N',  zh: '北' },
    { bit: 1, glyph: '↗',  en: 'NE', zh: '东北' },
    { bit: 2, glyph: '→',  en: 'E',  zh: '东' },
    { bit: 3, glyph: '↘',  en: 'SE', zh: '东南' },
    { bit: 4, glyph: '↓',  en: 'S',  zh: '南' },
    { bit: 5, glyph: '↙',  en: 'SW', zh: '西南' },
    { bit: 6, glyph: '←',  en: 'W',  zh: '西' },
    { bit: 7, glyph: '↖',  en: 'NW', zh: '西北' },
  ];

  function fillHitpointPanel(p) {
    p.appendChild(el('span', null, L({ en: 'Direction', zh: '方向' }) + ':'));
    HITPOINT_DIRS.forEach(dr => {
      const chip = el('button', 'chip' + (state.hitpointDir === dr.bit ? ' active' : ''));
      chip.textContent = dr.glyph;
      chip.title = L({ en: dr.en, zh: dr.zh });
      chip.addEventListener('click', () => {
        state.hitpointDir = dr.bit;
        fillToolPanel();
      });
      p.appendChild(chip);
    });
    const list = state.puzzle.hitpoints || [];
    p.appendChild(el('span', null,
      L({ en: `Cells: ${list.length}`, zh: `格子数：${list.length}` })));
    if (list.length) {
      p.appendChild(btn({ en: 'Clear all', zh: '清空全部' }, {
        secondary: true,
        onClick: () => { state.puzzle.hitpoints = []; rebuild(); },
      }));
    }
  }

  function handleHitpointClick(i) {
    const bit = state.hitpointDir;
    const mb = 1 << bit;
    const list = state.puzzle.hitpoints;
    const found = list.findIndex(h => h.cell === i);
    if (found >= 0) {
      const cur = list[found];
      cur.dirs ^= mb;
      if (!cur.dirs) list.splice(found, 1);
    } else {
      list.push({ cell: i, dirs: mb });
    }
    rebuild();
  }

  function fillSkyPanel(p) {
    const sky = state.puzzle.sky;
    const total = ['top', 'bottom', 'left', 'right']
      .reduce((n, side) => n + Array.prototype.filter.call(sky[side], v => !!v).length, 0);
    p.appendChild(el('span', null,
      L({ en: `Clues set: ${total}`, zh: `已设线索：${total}` })));
    p.appendChild(btn({ en: 'Clear all clues', zh: '清空全部线索' }, {
      secondary: true,
      onClick: () => {
        sky.top.fill(0); sky.bottom.fill(0); sky.left.fill(0); sky.right.fill(0);
        rebuild();
      },
    }));
  }

  function fillRegionPanel(p) {
    const pz = state.puzzle;
    const N = pz.N;
    const nRows = pz.rows != null ? pz.rows : N;
    const nCols = pz.cols != null ? pz.cols : N;
    const digits = pz.digits != null ? pz.digits : N;
    const existing = countExistingCells(pz);
    const regionCount = pz.regionCount != null ? pz.regionCount
      : (digits ? Math.floor(existing / digits) : N);
    /* Count cells per region up front so each button can show its own
       fill status. Regions that don't have any painted cells still get
       a 0-count entry via the `for r < regionCount` loop below. */
    const painted = new Map();
    for (let i = 0; i < nRows * nCols; i++) {
      if (pz.deleted && pz.deleted[i]) continue;
      const rg = pz.regions[i];
      if (rg < 0) continue;
      painted.set(rg, (painted.get(rg) || 0) + 1);
    }
    const label = el('span', null, L(T.regLbl) + ':');
    p.appendChild(label);
    const theme = AppTheme.get();
    /* One chip per region — count driven by p.regionCount, not p.N, so
       irregular puzzles with a different number of regions render correctly.
       Each button carries its own fill status: green when filled to exactly
       `digits` cells, red otherwise. */
    for (let r = 0; r < regionCount; r++) {
      const chip = el('button', 'chip region-chip');
      const sw = el('span', 'swatch'); sw.style.background = regionColor(r, theme);
      chip.appendChild(sw);
      const count = painted.get(r) || 0;
      const filled = count === digits;
      chip.appendChild(document.createTextNode(`${r + 1}(${count}/${digits})`));
      chip.classList.toggle('active', r === state.regionPick);
      chip.classList.toggle('region-filled', filled);
      chip.classList.toggle('region-unfilled', !filled);
      chip.addEventListener('click', () => {
        state.regionPick = r;
        fillToolPanel();
      });
      p.appendChild(chip);
    }
    /* Reset-to-boxes only applies to classic square grids where the
       rectangular box tiling is well-defined. */
    const isClassic = nRows === nCols && nRows === digits &&
      pz.boxR && pz.boxC && nRows % pz.boxR === 0 && nCols % pz.boxC === 0 &&
      !anyDeleted(pz);
    if (isClassic) {
      p.appendChild(btn({ en: 'Reset to boxes', zh: '恢复为矩形宫' }, {
        secondary: true,
        onClick: () => {
          state.puzzle.regions = Core.rectRegions(nRows, nCols, pz.boxR, pz.boxC);
          rebuild();
        },
      }));
    }
    p.appendChild(btn({ en: 'Clear regions', zh: '清空宫格' }, {
      secondary: true,
      onClick: () => {
        const total = nRows * nCols;
        for (let i = 0; i < total; i++) state.puzzle.regions[i] = -1;
        rebuild();
      },
    }));
    /* Unassigned counter stays outside the chips per the requested split —
       painted totals are shown per-chip, this line surfaces the running
       count of cells still needing an assignment. Kept visible even at 0
       so the user can confirm the layout is complete. */
    const unassigned = existing - Array.from(painted.values()).reduce((a, b) => a + b, 0);
    const hint = el('span', 'hint');
    hint.textContent = L({
      en: `${unassigned} cell${unassigned === 1 ? '' : 's'} unassigned${unassigned === 0 ? ' ✓' : ''}`,
      zh: `${unassigned} 个未指派格子${unassigned === 0 ? ' ✓' : ''}`,
    });
    if (unassigned === 0) hint.style.color = 'var(--success)';
    hint.style.flex = '1 1 100%';
    hint.style.textAlign = 'center';
    p.appendChild(hint);
  }

  function anyDeleted(pz) {
    if (!pz.deleted) return false;
    for (let i = 0; i < pz.deleted.length; i++) if (pz.deleted[i]) return true;
    return false;
  }

  function fillRainbowPanel(p) {
    const N = state.puzzle.N;
    const label = el('span', null, L({ en: 'Color', zh: '颜色' }) + ':');
    p.appendChild(label);
    for (let r = 1; r <= N; r++) {
      const chip = el('button', 'chip');
      const sw = el('span', 'swatch'); sw.style.background = spectraColor(r - 1);
      chip.appendChild(sw);
      chip.appendChild(document.createTextNode(String(r)));
      chip.classList.toggle('active', r === state.rainbowPick);
      chip.addEventListener('click', () => {
        state.rainbowPick = r;
        fillToolPanel();
      });
      p.appendChild(chip);
    }
    const total = Array.prototype.reduce.call(state.puzzle.rainbow, (n, v) => n + (v ? 1 : 0), 0);
    p.appendChild(el('span', null,
      L({ en: `Colored: ${total}`, zh: `已上色：${total}` })));
    p.appendChild(btn({ en: 'Clear all colors', zh: '清空所有颜色' }, {
      secondary: true,
      onClick: () => { state.puzzle.rainbow.fill(0); rebuild(); },
    }));
  }

  function fillCagePanel(p) {
    const draft = state.cageDraft;
    const info = el('span', null,
      L({ en: `Selected: ${draft.cells.length} cells`,
          zh: `已选：${draft.cells.length} 格` }));
    p.appendChild(info);
    p.appendChild(el('span', null, L(T.sumLbl) + ':'));
    const sumIn = el('input');
    sumIn.type = 'number'; sumIn.min = 1; sumIn.value = draft.sum;
    sumIn.placeholder = '—';
    sumIn.addEventListener('input', () => { draft.sum = sumIn.value; });
    p.appendChild(sumIn);
    p.appendChild(btn(T.newCage, { onClick: finishCage }));
    p.appendChild(btn({ en: 'Cancel', zh: '取消' }, {
      secondary: true,
      onClick: () => { state.cageDraft = { cells: [], sum: '' }; rebuild(); },
    }));
    if (state.puzzle.cages.length) {
      p.appendChild(btn({ en: 'Delete last cage', zh: '删除上一个杀手框' }, {
        secondary: true,
        onClick: () => { state.puzzle.cages.pop(); rebuild(); },
      }));
    }
  }

  function fillThermoPanel(p) {
    const draft = state.thermoDraft;
    p.appendChild(el('span', null,
      L({ en: `Path length: ${draft.cells.length}`,
          zh: `路径长度：${draft.cells.length}` })));
    p.appendChild(btn(T.newTh, { onClick: finishThermo }));
    if (draft.cells.length) {
      p.appendChild(btn(T.delSel, {
        secondary: true,
        onClick: () => { draft.cells.pop(); rebuild(); },
      }));
    }
    if (state.puzzle.thermos.length) {
      p.appendChild(btn({ en: 'Delete last thermo', zh: '删除上一根' }, {
        secondary: true,
        onClick: () => { state.puzzle.thermos.pop(); rebuild(); },
      }));
    }
  }

  function finishCage() {
    const draft = state.cageDraft;
    if (!draft.cells.length) return;
    const sum = draft.sum === '' ? null : Number(draft.sum);
    if (sum != null && (!Number.isFinite(sum) || sum <= 0)) return;
    state.puzzle.cages.push({ cells: [...draft.cells], sum });
    state.cageDraft = { cells: [], sum: '' };
    rebuild();
  }
  function finishThermo() {
    if (state.thermoDraft.cells.length < 2) return;
    state.puzzle.thermos.push([...state.thermoDraft.cells]);
    state.thermoDraft = { cells: [] };
    rebuild();
  }

  /* ---------- Extra Region tool ---------- */
  function fillExtraRegionPanel(p) {
    const N = state.puzzle.N;
    const draft = state.erDraft;
    p.appendChild(el('span', null,
      L({ en: `Selected: ${draft.cells.length} cells`,
          zh: `已选：${draft.cells.length} 格` })));
    /* Color picker for the next region to add. */
    p.appendChild(el('span', null, L({ en: 'Color', zh: '颜色' }) + ':'));
    for (let k = 0; k < Math.min(8, N); k++) {
      const chip = el('button', 'chip' + (state.erColor === k ? ' active' : ''));
      const sw = el('span', 'swatch');
      sw.style.background = extraRegionColor(k);
      chip.appendChild(sw);
      chip.appendChild(document.createTextNode(String(k + 1)));
      chip.addEventListener('click', () => { state.erColor = k; fillToolPanel(); });
      p.appendChild(chip);
    }
    p.appendChild(btn(T.finishER, { onClick: finishExtraRegion }));
    p.appendChild(btn({ en: 'Cancel', zh: '取消' }, {
      secondary: true,
      onClick: () => { state.erDraft = { cells: [] }; rebuild(); },
    }));
    const list = state.puzzle.extraRegions || [];
    p.appendChild(el('span', null,
      L({ en: `Regions: ${list.length}`, zh: `额外宫数：${list.length}` })));
    if (list.length) {
      p.appendChild(btn(T.delLastER, {
        secondary: true,
        onClick: () => { list.pop(); rebuild(); },
      }));
    }
  }
  function finishExtraRegion() {
    const draft = state.erDraft;
    if (!draft.cells.length) return;
    (state.puzzle.extraRegions = state.puzzle.extraRegions || []).push({
      cells: [...draft.cells],
      color: state.erColor,
    });
    state.erDraft = { cells: [] };
    state.erColor = (state.erColor + 1) % 8;
    rebuild();
  }
  /* Extra-region palette: distinct pastel-y tints, offset from Spectradoku so
     the two constraints don't share a colorway. */
  const EXTRA_REGION_HUES = [265, 45, 335, 145, 205, 25, 105, 305];
  function extraRegionColor(idx) {
    const h = EXTRA_REGION_HUES[idx % EXTRA_REGION_HUES.length];
    const theme = AppTheme.get();
    return theme === 'light'
      ? `hsl(${h}, 60%, 82%)`
      : `hsl(${h}, 40%, 30%)`;
  }

  /* Cage-style click-drag for extra region painting: begin/apply/end. */
  function beginERDrag(i) {
    const draft = state.erDraft;
    /* Clicking a cell owned by an existing extra region unfreezes it into
       the draft, same UX as cage clicks. */
    const list = state.puzzle.extraRegions || [];
    for (let k = 0; k < list.length; k++) {
      if (list[k].cells.includes(i)) {
        if (draft.cells.length) finishExtraRegion();
        const er = list.splice(k, 1)[0];
        state.erDraft = { cells: [...er.cells] };
        state.erColor = er.color | 0;
        state.erDrag = { mode: 'add' };
        rebuild();
        return;
      }
    }
    const has = draft.cells.indexOf(i) >= 0;
    state.erDrag = { mode: has ? 'remove' : 'add' };
    applyERDrag(i);
  }
  function applyERDrag(i) {
    if (!state.erDrag) return;
    const arr = state.erDraft.cells;
    const at = arr.indexOf(i);
    if (state.erDrag.mode === 'add' && at < 0) arr.push(i);
    else if (state.erDrag.mode === 'remove' && at >= 0) arr.splice(at, 1);
    else return;
    fillToolPanel();
    drawExtraRegions();
  }
  function endERDrag() { if (state.erDrag) { state.erDrag = null; analyze(); } }

  /* ---------- X-Sums edge panel ---------- */
  function fillXSumPanel(p) {
    const xs = state.puzzle.xsum;
    if (!xs) return;
    const total = ['top', 'bottom', 'left', 'right']
      .reduce((n, side) => n + Array.prototype.filter.call(xs[side], v => !!v).length, 0);
    p.appendChild(el('span', null,
      L({ en: `Clues set: ${total}`, zh: `已设线索：${total}` })));
    p.appendChild(btn({ en: 'Clear all clues', zh: '清空全部线索' }, {
      secondary: true,
      onClick: () => {
        xs.top.fill(0); xs.bottom.fill(0); xs.left.fill(0); xs.right.fill(0);
        rebuild();
      },
    }));
  }

  /* ---------- Count-Circle panel ---------- */
  function fillCountCirclePanel(p) {
    const cc = state.puzzle.countCircles || new Int8Array(state.puzzle.N * state.puzzle.N);
    let total = 0;
    for (let i = 0; i < cc.length; i++) if (cc[i]) total++;
    p.appendChild(el('span', null,
      L({ en: `Circles: ${total}`, zh: `圆圈数：${total}` })));
    if (total) {
      p.appendChild(btn({ en: 'Clear all', zh: '清空全部' }, {
        secondary: true,
        onClick: () => { cc.fill(0); rebuild(); },
      }));
    }
  }
  function paintCountCircleLight(i) {
    const cc = state.puzzle.countCircles;
    if (!cc) return;
    if (state.ccDrag == null) state.ccDrag = cc[i] ? 0 : 1;
    if (cc[i] === state.ccDrag) return;
    cc[i] = state.ccDrag;
    drawCountCircles();
  }

  /* ---------- Grid + frame (with skyscraper edges) ---------- */
  function cellSize(N) {
    /* Shrink cells so 16×16 still fits comfortably. */
    if (N <= 6)  return 46;
    if (N <= 9)  return 40;
    if (N <= 12) return 32;
    return 26;
  }

  function buildGridFrame(host) {
    const pz = state.puzzle;
    const N = pz.N;
    const nRows = pz.rows != null ? pz.rows : N;
    const nCols = pz.cols != null ? pz.cols : N;
    const size = cellSize(Math.max(nRows, nCols));
    const skyMode = state.tool === 'sky' ? 'sky'
                  : state.tool === 'sandwich' ? 'sandwich'
                  : state.tool === 'xsum' ? 'xsum'
                  : null;
    const showLK = state.tool === 'littleKiller' ||
                  (state.puzzle.littleKillers && state.puzzle.littleKillers.length);
    const edgeMode = skyMode || (showLK ? 'littleKiller' : null);
    const edge = edgeMode ? size : 0;
    const makeEdge = (side, idx) => {
      if (edgeMode === 'sandwich') return makeSandwich(side, idx);
      if (edgeMode === 'sky')      return makeSky(side, idx);
      if (edgeMode === 'xsum')     return makeXSum(side, idx);
      return makeLK(side, idx);
    };
    const frame = el('div', 'sudoku-frame');
    frame.style.setProperty('--cell-size', size + 'px');
    frame.style.gridTemplateColumns = `${edge}px repeat(${nCols}, ${size}px) ${edge}px`;
    frame.style.gridTemplateRows    = `${edge}px repeat(${nRows}, ${size}px) ${edge}px`;
    state.dom.frame = frame;
    state.dom.cellSize = size;
    state.dom.hasEdge = !!edgeMode;

    if (edgeMode) {
      /* Top edge: corner + nCols top clues + corner */
      frame.appendChild(el('div'));
      for (let c = 0; c < nCols; c++) frame.appendChild(makeEdge('top', c));
      frame.appendChild(el('div'));
    }

    const grid = el('div', 'sudoku-grid');
    grid.style.setProperty('--cell-size', size + 'px');
    grid.style.gridTemplateColumns = `repeat(${nCols}, ${size}px)`;
    grid.style.gridTemplateRows    = `repeat(${nRows}, ${size}px)`;
    grid.style.gridColumn = `2 / span ${nCols}`;
    grid.style.gridRow    = `2 / span ${nRows}`;

    if (edgeMode) {
      for (let r = 0; r < nRows; r++) {
        const left = makeEdge('left', r);
        left.style.gridColumn = '1';
        left.style.gridRow = (r + 2);
        frame.appendChild(left);

        const right = makeEdge('right', r);
        right.style.gridColumn = (nCols + 2);
        right.style.gridRow = (r + 2);
        frame.appendChild(right);
      }
    }

    frame.appendChild(grid);
    state.dom.grid = grid;

    if (edgeMode) {
      const brow = el('div');
      brow.style.gridColumn = '1';
      brow.style.gridRow = (nRows + 2);
      frame.appendChild(brow);
      for (let c = 0; c < nCols; c++) {
        const b = makeEdge('bottom', c);
        b.style.gridColumn = (c + 2);
        b.style.gridRow = (nRows + 2);
        frame.appendChild(b);
      }
      const brow2 = el('div');
      brow2.style.gridColumn = (nCols + 2);
      brow2.style.gridRow = (nRows + 2);
      frame.appendChild(brow2);
    }

    buildCells(grid);
    host.appendChild(frame);
  }

  function makeSky(side, idx) {
    return makeEdgeCell('sky', side, idx);
  }
  function makeSandwich(side, idx) {
    return makeEdgeCell('sandwich', side, idx);
  }
  function makeXSum(side, idx) {
    return makeEdgeCell('xsum', side, idx);
  }
  /* Shared edge-cell factory. `kind` selects the field, class, and clue-range:
     - sky:      1..N     (visible skyscraper count)
     - sandwich: 0..maxS  (sum between 1 and N; two digits for N ≥ 6). */
  function makeEdgeCell(kind, side, idx) {
    const N = state.puzzle.N;
    const arr = state.puzzle[kind][side];
    const val = arr[idx];
    const cls = kind === 'sandwich' ? 'sandwich-cell'
              : kind === 'xsum'     ? 'xsum-cell'
              : 'sky-cell';
    const cell = el('input', cls + (val ? ' filled' : ''));
    cell.type = 'text';
    cell.autocomplete = 'off';
    /* Sandwich / X-Sum totals can exceed 9; allow multi-digit input. */
    cell.maxLength = (kind === 'sandwich' || kind === 'xsum') ? 3 : 2;
    cell.value = val ? String(val) : '';
    const maxSandwich = Math.max(0, (N * (N + 1)) / 2 - 1 - N);  /* sum of 2..N-1 */
    const maxXSum = (N * (N + 1)) / 2;                           /* sum of 1..N */
    cell.title = kind === 'sky'
      ? L({ en: `Skyscrapers visible 1..${N} (blank clears)`,
            zh: `可见摩天楼数 1..${N}（留空清除）` })
      : kind === 'xsum'
      ? L({ en: `X-sum: first digit X, sum of first X digits 1..${maxXSum}`,
            zh: `X 和：首格为 X，前 X 个数字之和 1..${maxXSum}` })
      : L({ en: `Sandwich sum 0..${maxSandwich} between 1 and ${N}`,
            zh: `1 与 ${N} 之间的数字之和 0..${maxSandwich}` });
    if (side === 'top') {
      cell.style.gridColumn = (idx + 2);
      cell.style.gridRow = '1';
    }
    const maxVal = kind === 'sky' ? N
                 : kind === 'xsum' ? maxXSum
                 : maxSandwich;
    cell.addEventListener('focus', () => cell.select());
    cell.addEventListener('input', () => {
      const digits = cell.value.replace(/[^0-9]/g, '');
      const n = digits === '' ? 0 : Number(digits);
      if (n > maxVal) { cell.value = String(arr[idx] || ''); return; }
      cell.value = n ? String(n) : '';
      arr[idx] = n;
      cell.classList.toggle('filled', !!n);
      analyze();
    });
    cell.addEventListener('keydown', e => {
      if (e.key === 'Backspace' && cell.value === '') {
        e.preventDefault();
        arr[idx] = 0;
        return;
      }
      if (e.key === 'Escape') cell.blur();
    });
    return cell;
  }

  /* Little Killer edge slot: clickable when the LK tool is active. Shows tiny
     glyph+sum pairs for arrows anchored here so users can see what's already
     placed without walking the SVG overlay. Non-clickable when a different
     tool is active — the outer band is still reserved so the SVG overlay
     doesn't overflow into surrounding page content. */
  function makeLK(side, idx) {
    const N = state.puzzle.N;
    const active = state.tool === 'littleKiller';
    const dirs = lkDirsAt(side, idx, N);
    const clickable = active && dirs.length > 0;
    const btnEl = el(clickable ? 'button' : 'div', 'lk-edge');
    if (clickable) btnEl.type = 'button';
    if (side === 'top') {
      btnEl.style.gridColumn = (idx + 2);
      btnEl.style.gridRow = '1';
    }
    if (active && !dirs.length) btnEl.classList.add('disabled');
    if (clickable) btnEl.classList.add('clickable');
    const sel = state.lkSelected;
    if (sel && sel.side === side && sel.idx === idx) btnEl.classList.add('selected');
    /* Marker dot when this slot already anchors an arrow, so users can see
       which outer slots are occupied even before hovering. The SVG overlay
       still carries the direction + sum near the tail; the dot just makes the
       slot itself feel active. */
    if (lkArrowsAt(side, idx).length) btnEl.classList.add('has-arrow');
    if (clickable) {
      btnEl.title = L({
        en: 'Click to add or edit a Little Killer arrow from here',
        zh: '点击以在此处添加或编辑小杀手箭头',
      });
      btnEl.addEventListener('click', () => selectLKAnchor(side, idx));
    }
    return btnEl;
  }

  function selectLKAnchor(side, idx) {
    const N = state.puzzle.N;
    const dirs = lkDirsAt(side, idx, N);
    if (!dirs.length) return;
    /* Toggle off if the same cell is clicked again. */
    const cur = state.lkSelected;
    if (cur && cur.side === side && cur.idx === idx) {
      state.lkSelected = null;
      state.lkDraft = { dir: null, sum: '' };
      state.lkNotice = '';
      rebuild();
      return;
    }
    state.lkSelected = { side, idx };
    /* Default: pick the first direction that doesn't already have an arrow
       here, so the user can add a second entry without a manual dir click. */
    const usedDirs = new Set(lkArrowsAt(side, idx).map(x => x.lk.dir));
    const pick = dirs.find(d => !usedDirs.has(d)) || dirs[0];
    state.lkDraft = { dir: pick, sum: '' };
    state.lkNotice = '';
    rebuild();
  }

  function buildCells(grid) {
    const pz = state.puzzle;
    const { N, boxR, boxC, values, given, regions, rainbow } = pz;
    const nRows = pz.rows != null ? pz.rows : N;
    const nCols = pz.cols != null ? pz.cols : N;
    const total = nRows * nCols;
    const deleted = pz.deleted;
    const theme = AppTheme.get();
    state.dom.cells = [];

    /* Any hole forces the jigsaw border path — the box-boundary shortcut
       assumes a uniform rectangular tiling. */
    const hasCustom = hasCustomRegions() || (deleted && Array.prototype.some.call(deleted, v => v));
    grid.classList.toggle('jigsaw', hasCustom);
    grid.classList.toggle('region-mode', state.tool === 'region');
    grid.classList.toggle('grid-shape-mode', state.tool === 'grid');

    for (let i = 0; i < total; i++) {
      const r = (i / nCols) | 0, c = i % nCols;
      if (deleted && deleted[i]) {
        /* Deleted cell: a non-interactive spacer so the grid layout stays
           square. Keep the entry in state.dom.cells as null so index maths
           still lines up. */
        const gap = el('div', 'sudoku-cell deleted');
        gap.dataset.idx = i;
        /* Even a deleted cell needs a click handler when the user is in
           the Grid tool, so they can un-delete it. */
        gap.addEventListener('mousedown', (e) => {
          if (state.tool === 'grid') { e.preventDefault(); toggleDeletedCell(i); }
        });
        grid.appendChild(gap);
        state.dom.cells.push(null);
        continue;
      }
      const input = el('input', 'sudoku-cell');
      input.type = 'text';
      input.autocomplete = 'off';
      input.maxLength = 1;
      input.style.setProperty('--region-bg', regions[i] >= 0 ? regionColor(regions[i], theme) : 'transparent');
      /* Thick borders on region boundaries (or grid edges). Neighbours are
         "outside" if they don't exist or are deleted. */
      const isOutside = (rr, cc) => {
        if (rr < 0 || rr >= nRows || cc < 0 || cc >= nCols) return true;
        if (deleted && deleted[rr * nCols + cc]) return true;
        return false;
      };
      /* Border decision per side. The neighbour can be:
           - out-of-grid / deleted (outside the shape)   → use bx-*-outer (3px)
           - a different real region                     → use bx-*     (1.5px, pairs with the other side)
           - the same region, or two unassigned cells    → no border
         Two adjacent unassigned cells intentionally get NO border so the
         paint-in-progress state doesn't bristle with stray internal edges. */
      const chooseBorder = (rr, cc, side) => {
        const outside = isOutside(rr, cc);
        if (outside) {
          if (regions[i] < 0) return null;  /* unassigned touching outside: no border */
          return 'bx-' + side + '-outer';
        }
        const nr = regions[rr * nCols + cc];
        if (regions[i] < 0 && nr < 0) return null;
        if (regions[i] === nr) return null;
        return 'bx-' + side;
      };
      if (hasCustom) {
        const t = chooseBorder(r-1, c, 't'); if (t) input.classList.add(t);
        const l = chooseBorder(r, c-1, 'l'); if (l) input.classList.add(l);
        const b = chooseBorder(r+1, c, 'b'); if (b) input.classList.add(b);
        const rg = chooseBorder(r, c+1, 'r'); if (rg) input.classList.add(rg);
      } else {
        /* Internal box separators (1.5px on each side, meet at 3px). */
        if ((c + 1) % boxC === 0 && c !== nCols - 1) input.classList.add('bx-r');
        if (c > 0 && c % boxC === 0)                 input.classList.add('bx-l');
        if ((r + 1) % boxR === 0 && r !== nRows - 1) input.classList.add('bx-b');
        if (r > 0 && r % boxR === 0)                 input.classList.add('bx-t');
        /* Outer perimeter for classic grids: cells on the edge get the
           full 3px outer border so the shape's outline matches internal
           box borders in width. */
        if (r === 0)         input.classList.add('bx-t-outer');
        if (c === 0)         input.classList.add('bx-l-outer');
        if (r === nRows - 1) input.classList.add('bx-b-outer');
        if (c === nCols - 1) input.classList.add('bx-r-outer');
      }
      if (rainbow && rainbow[i]) {
        input.style.setProperty('--rainbow-bg', spectraColor(rainbow[i] - 1));
        input.classList.add('rainbow-tinted');
      }
      let display = '';
      if (values[i]) display = digitToChar(values[i]);
      input.value = display;
      if (values[i] && given[i]) input.classList.add('given');
      input.dataset.idx = i;
      attachCellHandlers(input, i);
      grid.appendChild(input);
      state.dom.cells.push(input);
    }

    /* Cage borders + sum labels. */
    drawCages();

    /* Thermometer SVG overlay. */
    drawThermos();

    /* Whisper / Region-Sum / Modular / Renban / Palindrome / Entropic /
       Parity-Line overlays share one SVG layer. */
    drawLines();

    /* Arrows (base pill + shaft + head). */
    drawArrows();

    /* Quadruple circles at grid intersections. */
    drawQuadruples();

    /* Kropki dots. */
    drawKropki();

    /* Compare / XV edge marks. */
    drawCompare();
    drawXV();

    /* Odd/Even parity cell backgrounds. */
    drawParity();

    /* Little Killer diagonal arrows (drawn outside the grid). */
    drawLittleKillers();

    /* Column / Row index cell marks. */
    drawIndexCells();

    /* Hitpoint per-cell arrows. */
    drawHitpointArrows();

    /* Extra regions (colored tint + dashed outline). */
    drawExtraRegions();

    /* Count-circle overlay (small ring inside each marked cell). */
    drawCountCircles();

    /* Slow-thermo / Between / Lockout / Sequence lines. */
    drawSlowThermos();
    drawBetweenLikeLines();

    /* Pencilmark analysis overlay (only when pencilmarkOn). */
    drawPencilmarks();
  }

  function hasCustomRegions() {
    const pz = state.puzzle;
    const { N, boxR, boxC, regions } = pz;
    const nRows = pz.rows != null ? pz.rows : N;
    const nCols = pz.cols != null ? pz.cols : N;
    /* Any non-square, holey, or region-cleared grid is by definition
       "custom" — the classic rectangular tiling doesn't apply. */
    if (nRows !== nCols || nRows !== N) return true;
    if (anyDeleted(pz)) return true;
    if (!(boxR && boxC && nRows % boxR === 0 && nCols % boxC === 0)) return true;
    const rect = Core.rectRegions(nRows, nCols, boxR, boxC);
    for (let i = 0; i < rect.length; i++) if (rect[i] !== regions[i]) return true;
    return false;
  }

  /* Inset padding (in px) between the cage outline and the cell edges. */
  const CAGE_PAD = 3;

  function drawCages() {
    const { N, cages } = state.puzzle;
    const grid = state.dom.grid;
    grid.querySelectorAll('.cage-svg').forEach(n => n.remove());

    const size = state.dom.cellSize;
    const total = N * size;
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'cage-svg');
    svg.setAttribute('width', total);
    svg.setAttribute('height', total);
    svg.setAttribute('viewBox', `0 0 ${total} ${total}`);

    /* Finalized cages. */
    cages.forEach(cage => {
      addCageOutline(svg, cage.cells, size, '');
      if (cage.sum != null) addCageSum(svg, cage.cells, size, cage.sum, '');
    });

    /* Draft cage (only visible while cage tool is active). The cells
       themselves are lit up via the `.sel` region highlight (gray fill,
       accent perimeter); only the pending sum label is rendered here. */
    if (state.tool === 'cage' && state.cageDraft.cells.length) {
      if (state.cageDraft.sum !== '' && state.cageDraft.sum != null) {
        addCageSum(svg, state.cageDraft.cells, size, state.cageDraft.sum, 'draft');
      }
    }

    grid.appendChild(svg);

    /* Per-cell `.sel` region highlight for tools that build a multi-cell
       draft. Cells appear as one contiguous region with a gray fill and a
       blue border drawn only along the perimeter (edges where a neighbouring
       cell is not part of the selection). */
    state.dom.cells.forEach(c => {
      if (!c) return;
      c.classList.remove('sel', 'sel-t', 'sel-b', 'sel-l', 'sel-r', 'kropki-first');
    });
    let selCells = [];
    if (state.tool === 'thermo') selCells = state.thermoDraft.cells;
    else if (LINE_TOOLS.has(state.tool)) selCells = state.lineDraft.cells;
    else if (state.tool === 'cage') selCells = state.cageDraft.cells;
    else if (state.tool === 'arrow') selCells = state.arrowDraft.base.concat(state.arrowDraft.path);
    applySelEdges(selCells);
    const markFirst = (idx) => { const c = state.dom.cells[idx]; if (c) c.classList.add('kropki-first'); };
    if (state.tool === 'kropki'  && state.kropkiFirst  >= 0) markFirst(state.kropkiFirst);
    if (state.tool === 'compare' && state.compareFirst >= 0) markFirst(state.compareFirst);
    if (state.tool === 'xv'      && state.xvFirst      >= 0) markFirst(state.xvFirst);
  }

  /* Given a set of selected cell indices, mark each cell with `.sel` plus
     directional edge classes (`.sel-t/b/l/r`) for the outer perimeter.
     Interior shared edges get no border, so the group renders as one region. */
  function applySelEdges(cells) {
    if (!cells || !cells.length) return;
    const N = state.puzzle.N;
    const inSet = new Uint8Array(N * N);
    for (const i of cells) inSet[i] = 1;
    for (const i of cells) {
      const cell = state.dom.cells[i]; if (!cell) continue;
      const r = (i / N) | 0, c = i % N;
      cell.classList.add('sel');
      if (r === 0     || !inSet[i - N]) cell.classList.add('sel-t');
      if (r === N - 1 || !inSet[i + N]) cell.classList.add('sel-b');
      if (c === 0     || !inSet[i - 1]) cell.classList.add('sel-l');
      if (c === N - 1 || !inSet[i + 1]) cell.classList.add('sel-r');
    }
  }

  function addCageSum(svg, cells, S, sum, kind) {
    const { N } = state.puzzle;
    /* Anchor = top-most, left-most cell of the cage. */
    let anchor = cells[0];
    for (const i of cells) {
      const r = (i / N) | 0, c = i % N;
      const ar = (anchor / N) | 0, ac = anchor % N;
      if (r < ar || (r === ar && c < ac)) anchor = i;
    }
    const ar = (anchor / N) | 0, ac = anchor % N;
    const fs = Math.max(9, Math.round(S * 0.28));
    const t = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    t.setAttribute('class', 'sum' + (kind ? ' ' + kind : ''));
    t.setAttribute('x', ac * S + CAGE_PAD + 2);
    t.setAttribute('y', ar * S + CAGE_PAD + 1);
    t.setAttribute('font-size', fs);
    t.textContent = String(sum);
    svg.appendChild(t);
  }

  /* Compute the inset dashed outline for one cage and append it to `svg`.
     For a cell whose neighbor is outside the cage, we draw an inset segment
     along the shared side. Extensions handle convex corners (segment reaches
     the inset corner); explicit closure segments handle concave corners
     (where three of the four cells around an interior vertex are in the cage,
     the boundary must dip inward to close). */
  function addCageOutline(svg, cells, S, kind) {
    if (!cells.length) return;
    const { N } = state.puzzle;
    const inCage = new Uint8Array(N * N);
    for (const i of cells) inCage[i] = 1;
    const has = (r, c) => (r >= 0 && r < N && c >= 0 && c < N && inCage[r * N + c]);
    const P = CAGE_PAD;
    const segments = [];
    const push = (x1, y1, x2, y2) => segments.push([x1, y1, x2, y2]);

    for (const idx of cells) {
      const r = (idx / N) | 0, c = idx % N;
      const x0 = c * S, y0 = r * S, x1 = x0 + S, y1 = y0 + S;

      /* Top edge is a boundary when the cell above isn't in the cage. */
      if (!has(r - 1, c)) {
        let a = x0 + P, b = x1 - P;
        if (has(r, c - 1) && !has(r - 1, c - 1)) a -= P + P;  /* reach left neighbor */
        if (has(r, c + 1) && !has(r - 1, c + 1)) b += P + P;  /* reach right neighbor */
        push(a, y0 + P, b, y0 + P);
      }
      if (!has(r + 1, c)) {
        let a = x0 + P, b = x1 - P;
        if (has(r, c - 1) && !has(r + 1, c - 1)) a -= P + P;
        if (has(r, c + 1) && !has(r + 1, c + 1)) b += P + P;
        push(a, y1 - P, b, y1 - P);
      }
      if (!has(r, c - 1)) {
        let a = y0 + P, b = y1 - P;
        if (has(r - 1, c) && !has(r - 1, c - 1)) a -= P + P;
        if (has(r + 1, c) && !has(r + 1, c - 1)) b += P + P;
        push(x0 + P, a, x0 + P, b);
      }
      if (!has(r, c + 1)) {
        let a = y0 + P, b = y1 - P;
        if (has(r - 1, c) && !has(r - 1, c + 1)) a -= P + P;
        if (has(r + 1, c) && !has(r + 1, c + 1)) b += P + P;
        push(x1 - P, a, x1 - P, b);
      }
    }

    /* Concave-corner closures. For every interior vertex where exactly 3 of
       the 4 surrounding cells are in the cage, add the two short segments
       that bridge the boundary around the missing cell. */
    for (let vr = 1; vr < N; vr++) {
      for (let vc = 1; vc < N; vc++) {
        const A = has(vr - 1, vc - 1), B = has(vr - 1, vc);
        const C = has(vr, vc - 1),     D = has(vr, vc);
        const count = A + B + C + D;
        if (count !== 3) continue;
        const X = vc * S, Y = vr * S;
        if (!A) { /* B, C, D in — close around top-left */
          push(X + P, Y - P, X + P, Y + P);
          push(X + P, Y + P, X - P, Y + P);
        } else if (!B) { /* A, C, D in — close around top-right */
          push(X - P, Y - P, X - P, Y + P);
          push(X - P, Y + P, X + P, Y + P);
        } else if (!C) { /* A, B, D in — close around bottom-left */
          push(X - P, Y - P, X + P, Y - P);
          push(X + P, Y - P, X + P, Y + P);
        } else if (!D) { /* A, B, C in — close around bottom-right */
          push(X + P, Y - P, X - P, Y - P);
          push(X - P, Y - P, X - P, Y + P);
        }
      }
    }

    /* Emit segments as individual polylines so dashes reset per stroke. */
    const cls = 'outline' + (kind ? ' ' + kind : '');
    for (const [x1, y1, x2, y2] of segments) {
      const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      line.setAttribute('class', cls);
      line.setAttribute('x1', x1);
      line.setAttribute('y1', y1);
      line.setAttribute('x2', x2);
      line.setAttribute('y2', y2);
      svg.appendChild(line);
    }
  }

  function drawThermos() {
    const { N, thermos } = state.puzzle;
    const size = state.dom.cellSize;
    const total = N * size;
    /* Remove old overlays. */
    const grid = state.dom.grid;
    grid.querySelectorAll('.thermo-svg').forEach(n => n.remove());

    const drawOne = (path, active) => {
      if (path.length === 0) return;
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('class', 'thermo-svg');
      svg.setAttribute('width', total);
      svg.setAttribute('height', total);
      svg.setAttribute('viewBox', `0 0 ${total} ${total}`);
      const centers = path.map(i => {
        const r = (i / N) | 0, c = i % N;
        return [c * size + size / 2, r * size + size / 2];
      });
      /* Bulb + stem sit inside one <g> so the group's opacity applies to the
         merged shape — overlapping regions no longer double-alpha into a
         darker patch the way stacked semi-transparent shapes do. */
      const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      g.setAttribute('class', 'thermo-group' + (active ? ' active' : ''));
      const bulb = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      bulb.setAttribute('class', 'bulb');
      bulb.setAttribute('cx', centers[0][0]);
      bulb.setAttribute('cy', centers[0][1]);
      bulb.setAttribute('r', size * 0.34);
      g.appendChild(bulb);
      if (centers.length > 1) {
        const pts = centers.map(p => `${p[0]},${p[1]}`).join(' ');
        const line = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
        line.setAttribute('class', 'stem');
        line.setAttribute('points', pts);
        line.setAttribute('stroke-width', size * 0.22);
        line.setAttribute('stroke-linecap', 'round');
        line.setAttribute('stroke-linejoin', 'round');
        g.appendChild(line);
      }
      svg.appendChild(g);
      grid.appendChild(svg);
    };

    thermos.forEach(t => drawOne(t, false));
    if (state.tool === 'thermo') drawOne(state.thermoDraft.cells, true);
  }

  /* Whisper, region-sum, and modular lines share a single SVG overlay layer.
     Each type has its own class so styles/colors/dash-patterns distinguish
     them and no two look alike. */
  /* Type-tag glyph for each line class (single character near the line's
     first cell so overlapping lines stay identifiable). */
  const LINE_TAG_GLYPH = {
    whisper:   'W',
    regionsum: 'Σ',
    modular:   'M',
    renban:    'R',
    palindrome:'P',
    entropic:  'E',
    parityline:'±',
  };

  function drawLines() {
    const { N, whispers, regionSums, modulars, renbans, palindromes, entropics, parityLines } = state.puzzle;
    const size = state.dom.cellSize;
    const total = N * size;
    const grid = state.dom.grid;
    grid.querySelectorAll('.line-svg').forEach(n => n.remove());

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'line-svg');
    svg.setAttribute('width', total);
    svg.setAttribute('height', total);
    svg.setAttribute('viewBox', `0 0 ${total} ${total}`);

    const drawOne = (cls, path, active) => {
      if (path.length < 1) return;
      const pts = path.map(i => {
        const r = (i / N) | 0, c = i % N;
        return `${c * size + size / 2},${r * size + size / 2}`;
      }).join(' ');
      const line = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
      line.setAttribute('class', 'line ' + cls + (active ? ' active' : ''));
      line.setAttribute('points', pts);
      line.setAttribute('stroke-width', size * 0.18);
      line.setAttribute('stroke-linecap', 'round');
      line.setAttribute('stroke-linejoin', 'round');
      svg.appendChild(line);
      /* Small type-tag near the first cell so intersecting lines stay
         identifiable even when colors overlap. */
      const first = path[0];
      const fr = (first / N) | 0, fc = first % N;
      const t = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      t.setAttribute('class', 'line-tag ' + cls);
      t.setAttribute('x', fc * size + size * 0.12);
      t.setAttribute('y', fr * size + size * 0.28);
      t.setAttribute('font-size', Math.max(8, size * 0.28));
      t.textContent = LINE_TAG_GLYPH[cls] || '';
      svg.appendChild(t);
    };

    whispers   .forEach(l => drawOne('whisper',    l, false));
    regionSums .forEach(l => drawOne('regionsum',  l, false));
    modulars   .forEach(l => drawOne('modular',    l, false));
    renbans    .forEach(l => drawOne('renban',     l, false));
    palindromes.forEach(l => drawOne('palindrome', l, false));
    entropics  .forEach(l => drawOne('entropic',   l, false));
    parityLines.forEach(l => drawOne('parityline', l, false));

    /* Preview the current draft in its own line class so users see which
       constraint they're building without having to squint at the tab. */
    const draftClsByTool = {
      whisper: 'whisper', regionSum: 'regionsum', modular: 'modular',
      renban: 'renban', palindrome: 'palindrome', entropic: 'entropic',
      parityLine: 'parityline',
    };
    const draftCls = draftClsByTool[state.tool];
    if (draftCls) drawOne(draftCls, state.lineDraft.cells, true);

    grid.appendChild(svg);
  }

  /* Arrows overlay. Each arrow has a pill-shaped base at its head cells
     and a shaft polyline with an arrowhead at the tip. */
  function drawArrows() {
    const { N, arrows } = state.puzzle;
    const size = state.dom.cellSize;
    const total = N * size;
    const grid = state.dom.grid;
    grid.querySelectorAll('.arrow-svg').forEach(n => n.remove());

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'arrow-svg');
    svg.setAttribute('width', total);
    svg.setAttribute('height', total);
    svg.setAttribute('viewBox', `0 0 ${total} ${total}`);

    const drawOne = (base, path, active) => {
      const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      g.setAttribute('class', 'arrow-group' + (active ? ' active' : ''));
      /* Base pill: rounded rectangle spanning the base cells. */
      if (base.length) {
        const rs = base.map(i => (i / N) | 0);
        const cs = base.map(i => i % N);
        const r0 = Math.min(...rs), r1 = Math.max(...rs);
        const c0 = Math.min(...cs), c1 = Math.max(...cs);
        const pad = size * 0.14;
        const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        rect.setAttribute('class', 'base');
        rect.setAttribute('x', c0 * size + pad);
        rect.setAttribute('y', r0 * size + pad);
        rect.setAttribute('width',  (c1 - c0 + 1) * size - pad * 2);
        rect.setAttribute('height', (r1 - r0 + 1) * size - pad * 2);
        rect.setAttribute('rx', size * 0.42);
        rect.setAttribute('ry', size * 0.42);
        g.appendChild(rect);
      }
      /* Shaft polyline from the base pill's edge (not centre) through the
         path cells. The pill has an "end-cap" radius of ~size * 0.36 — the
         base rectangle is inset by `pad` on every side, so the rounded
         end sits size/2 - pad = size*0.36 from the anchor cell centre.
         Shifting the shaft start out by that radius makes the shaft
         appear to emerge from the pill's edge rather than passing
         through its centre. */
      if (path.length) {
        const anchor = base.length ? base[base.length - 1] : path[0];
        const centerOf = i => {
          const r = (i / N) | 0, c = i % N;
          return [c * size + size / 2, r * size + size / 2];
        };
        const anchorC = centerOf(anchor);
        const firstShaftC = centerOf(path[0]);
        let startPoint = anchorC;
        if (base.length) {
          const dx = firstShaftC[0] - anchorC[0];
          const dy = firstShaftC[1] - anchorC[1];
          const dist = Math.hypot(dx, dy) || 1;
          const pillR = size * 0.36;
          startPoint = [
            anchorC[0] + (dx / dist) * pillR,
            anchorC[1] + (dy / dist) * pillR,
          ];
        }
        const pts = [startPoint, ...path.map(centerOf)];
        const pline = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
        pline.setAttribute('class', 'shaft');
        pline.setAttribute('points', pts.map(p => p.join(',')).join(' '));
        pline.setAttribute('stroke-width', Math.max(1.4, size * 0.06));
        pline.setAttribute('fill', 'none');
        pline.setAttribute('stroke-linecap', 'round');
        pline.setAttribute('stroke-linejoin', 'round');
        g.appendChild(pline);
        /* Arrowhead: small triangle at the tip pointing along the last segment. */
        if (pts.length >= 2) {
          const tip = pts[pts.length - 1];
          const prev = pts[pts.length - 2];
          const dx = tip[0] - prev[0], dy = tip[1] - prev[1];
          const len = Math.hypot(dx, dy) || 1;
          const ux = dx / len, uy = dy / len;
          const nx = -uy, ny = ux;   /* perpendicular unit vector */
          const H = size * 0.22;
          const W = size * 0.13;
          const bx = tip[0] - ux * H, by = tip[1] - uy * H;
          const p1 = [bx + nx * W, by + ny * W];
          const p2 = [bx - nx * W, by - ny * W];
          const head = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
          head.setAttribute('class', 'head');
          head.setAttribute('points', `${tip[0]},${tip[1]} ${p1[0]},${p1[1]} ${p2[0]},${p2[1]}`);
          g.appendChild(head);
        }
      }
      svg.appendChild(g);
    };

    arrows.forEach(a => drawOne(a.base || [], a.path || [], false));
    if (state.tool === 'arrow') {
      const d = state.arrowDraft;
      drawOne(d.base, d.path, true);
    }
    grid.appendChild(svg);
  }

  /* Quadruple overlay. A small circle sits at the intersection of 4 cells
     with up to 4 required digits laid out around its centre. */
  function drawQuadruples() {
    const { N, quadruples } = state.puzzle;
    const size = state.dom.cellSize;
    const total = N * size;
    const grid = state.dom.grid;
    grid.querySelectorAll('.quad-svg').forEach(n => n.remove());
    if (!quadruples.length) return;

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'quad-svg');
    svg.setAttribute('width', total);
    svg.setAttribute('height', total);
    svg.setAttribute('viewBox', `0 0 ${total} ${total}`);

    for (const q of quadruples) {
      const cx = q.c * size, cy = q.r * size;
      const rad = size * 0.28;
      const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      g.setAttribute('class', 'quad');
      const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      circle.setAttribute('cx', cx);
      circle.setAttribute('cy', cy);
      circle.setAttribute('r', rad);
      g.appendChild(circle);
      /* Layout digits: 1-4 slots — TL, TR, BL, BR. */
      const slots = [[-1, -1], [1, -1], [-1, 1], [1, 1]];
      const digits = (q.digits || []).slice(0, 4);
      digits.forEach((d, k) => {
        const [dx, dy] = slots[k];
        const t = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        t.setAttribute('class', 'digit');
        t.setAttribute('x', cx + dx * rad * 0.45);
        t.setAttribute('y', cy + dy * rad * 0.45);
        t.setAttribute('text-anchor', 'middle');
        t.setAttribute('dominant-baseline', 'central');
        t.setAttribute('font-size', Math.max(8, size * 0.26));
        t.textContent = digitToChar(d);
        g.appendChild(t);
      });
      svg.appendChild(g);
    }
    grid.appendChild(svg);
  }

  /* Kropki dots overlay. A small circle sits on the midpoint of the shared
     edge between two orthogonally-adjacent cells. White dots have a filled
     white body with a dark rim; black dots are solid dark with a light rim. */
  function drawKropki() {
    const { N, kropki } = state.puzzle;
    const size = state.dom.cellSize;
    const total = N * size;
    const grid = state.dom.grid;
    grid.querySelectorAll('.kropki-svg').forEach(n => n.remove());

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'kropki-svg');
    svg.setAttribute('width', total);
    svg.setAttribute('height', total);
    svg.setAttribute('viewBox', `0 0 ${total} ${total}`);

    for (const d of kropki) {
      const [ar, ac] = [(d.a / N) | 0, d.a % N];
      const [br, bc] = [(d.b / N) | 0, d.b % N];
      const cx = ((ac + bc) / 2 + 0.5) * size;
      const cy = ((ar + br) / 2 + 0.5) * size;
      const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      dot.setAttribute('class', 'kropki-dot ' + (d.kind === 'w' ? 'white' : 'black'));
      dot.setAttribute('cx', cx);
      dot.setAttribute('cy', cy);
      dot.setAttribute('r', Math.max(4, size * 0.14));
      svg.appendChild(dot);
    }
    grid.appendChild(svg);
  }

  /* Shared helper: for two orthogonally-adjacent cells a<b, return the
     midpoint of their shared edge and the neighbour orientation. */
  function edgeMidpoint(a, b, N, size) {
    const [ar, ac] = [(a / N) | 0, a % N];
    const [br, bc] = [(b / N) | 0, b % N];
    const cx = ((ac + bc) / 2 + 0.5) * size;
    const cy = ((ar + br) / 2 + 0.5) * size;
    const horizontal = ar === br;   /* pair lies on a horizontal neighbour edge */
    return { cx, cy, horizontal, ar, ac, br, bc };
  }

  /* Compare marks: a chevron pointing at the smaller cell (kind='lt' means
     a<b so it points at a; 'gt' means a>b so it points at b). Rotated to
     lie on the shared edge; drawn as an SVG polyline in accent color. */
  function drawCompare() {
    const { N, compare } = state.puzzle;
    const size = state.dom.cellSize;
    const total = N * size;
    const grid = state.dom.grid;
    grid.querySelectorAll('.compare-svg').forEach(n => n.remove());

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'compare-svg');
    svg.setAttribute('width', total);
    svg.setAttribute('height', total);
    svg.setAttribute('viewBox', `0 0 ${total} ${total}`);

    for (const d of compare) {
      const em = edgeMidpoint(d.a, d.b, N, size);
      /* Which cell is smaller? point the chevron at it. */
      const smaller = d.kind === 'lt' ? d.a : d.b;
      const [sr, sc] = [(smaller / N) | 0, smaller % N];
      const [or, oc] = smaller === d.a
        ? [(d.b / N) | 0, d.b % N]
        : [(d.a / N) | 0, d.a % N];
      /* Direction from the edge midpoint toward the SMALLER cell. */
      const dx = Math.sign(sc - oc);   /* -1 (left) or +1 (right) or 0 */
      const dy = Math.sign(sr - or);   /* -1 (up)   or +1 (down)  or 0 */
      /* Base chevron is a "<" opening to the right (points left).
         Rotate so its point aligns with (dx, dy). */
      const angle = Math.atan2(dy, dx) * 180 / Math.PI;   /* 180=left, 0=right, -90=up, 90=down */
      /* Rotation needed so the base ">" (points right, angle 0) faces (dx,dy).
         Actually we author the glyph as ">" (points right) and rotate. */
      const rot = angle;
      const h = size * 0.22;   /* half-height of chevron */
      const w = size * 0.16;   /* wing length */
      const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      g.setAttribute('class', 'compare-mark');
      g.setAttribute('transform', `translate(${em.cx},${em.cy}) rotate(${rot})`);
      /* Chevron bounding box previously spanned x∈[-w, 0], so its visual
         centre sat at (-w/2, 0) — the "point" landed on the edge midpoint
         instead of the whole glyph. We re-author it centred on the origin
         (bbox x∈[-w/2, w/2]) so that translate(cx, cy) actually puts the
         mark's centre on the shared-edge midpoint. */
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
      path.setAttribute('points', `${-w/2},${-h} ${w/2},0 ${-w/2},${h}`);
      path.setAttribute('stroke-width', Math.max(1.5, size * 0.06));
      g.appendChild(path);
      svg.appendChild(g);
    }
    grid.appendChild(svg);
  }

  /* XV clues: "X" or "V" text on the shared edge. */
  function drawXV() {
    const { N, xv } = state.puzzle;
    const size = state.dom.cellSize;
    const total = N * size;
    const grid = state.dom.grid;
    grid.querySelectorAll('.xv-svg').forEach(n => n.remove());

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'xv-svg');
    svg.setAttribute('width', total);
    svg.setAttribute('height', total);
    svg.setAttribute('viewBox', `0 0 ${total} ${total}`);

    for (const d of xv) {
      const em = edgeMidpoint(d.a, d.b, N, size);
      const t = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      t.setAttribute('class', 'xv-mark ' + d.kind);
      t.setAttribute('x', em.cx);
      t.setAttribute('y', em.cy);
      t.setAttribute('text-anchor', 'middle');
      t.setAttribute('dominant-baseline', 'middle');
      t.setAttribute('font-size', Math.max(10, size * 0.42));
      t.textContent = d.kind === 'x' ? 'X' : 'V';
      svg.appendChild(t);
    }
    grid.appendChild(svg);
  }

  /* Parity marks: toggle CSS classes on the cell inputs — the actual glyph
     is a background-image on the input, which sits behind the typed digit
     without any layering gymnastics. */
  function drawParity() {
    const { parity } = state.puzzle;
    for (let i = 0; i < parity.length; i++) {
      const c = state.dom.cells[i]; if (!c) continue;
      c.classList.remove('parity-odd', 'parity-even');
      if (parity[i] === 1) c.classList.add('parity-odd');
      else if (parity[i] === 2) c.classList.add('parity-even');
    }
  }

  /* Little Killer arrows: SVG overlay attached to the grid, but each arrow
     is drawn OUTSIDE the grid perimeter (relies on overflow: visible). Each
     arrow is a short segment plus arrowhead pointing into the grid, with the
     sum rendered next to the arrow's tail. */
  function drawLittleKillers() {
    const N = state.puzzle.N;
    const lks = state.puzzle.littleKillers || [];
    const size = state.dom.cellSize;
    const total = N * size;
    const grid = state.dom.grid;
    grid.querySelectorAll('.lk-svg').forEach(n => n.remove());

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'lk-svg');
    svg.setAttribute('width', total);
    svg.setAttribute('height', total);
    svg.setAttribute('viewBox', `0 0 ${total} ${total}`);

    const OUT = size * 0.55;   /* distance outside grid for arrow tail */

    function anchor(side, idx) {
      /* Returns the entry-cell centre + a unit vector pointing INTO the grid
         (opposite of the arrow's tail direction). */
      let ax, ay, ux, uy;
      if (side === 'top')    { ax = (idx + 0.5) * size; ay = 0;          ux = 0;  uy = 1; }
      else if (side === 'bottom') { ax = (idx + 0.5) * size; ay = total; ux = 0;  uy = -1; }
      else if (side === 'left')   { ax = 0; ay = (idx + 0.5) * size;     ux = 1;  uy = 0; }
      else                        { ax = total; ay = (idx + 0.5) * size; ux = -1; uy = 0; }
      return { ax, ay, ux, uy };
    }
    function dirVec(dir) {
      /* Direction the arrow POINTS (into the grid). */
      if (dir === 'dr') return [1, 1];
      if (dir === 'dl') return [-1, 1];
      if (dir === 'ur') return [1, -1];
      return [-1, -1];
    }

    lks.forEach((lk, li) => {
      const { ax, ay, ux, uy } = anchor(lk.side, lk.idx);
      /* Tail anchor: OUT pixels outside the grid, in the opposite direction. */
      const tailX = ax - ux * OUT;
      const tailY = ay - uy * OUT;
      /* Arrow direction (into grid). Normalize for unit vector. */
      const [dx, dy] = dirVec(lk.dir);
      const len = Math.hypot(dx, dy);
      const nx = dx / len, ny = dy / len;
      /* Segment: from tailX,tailY toward (tailX + nx*L, tailY + ny*L). */
      const L = size * 0.5;
      const tipX = tailX + nx * L;
      const tipY = tailY + ny * L;
      const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      g.setAttribute('class', 'lk-arrow');
      g.dataset.index = String(li);
      /* Click on any arrow group selects its anchor in the LK tool so users
         can edit/delete via the panel. Outside the LK tool, clicks are ignored
         so the arrow doesn't disappear from other editors accidentally. */
      g.addEventListener('click', () => {
        if (state.tool !== 'littleKiller') return;
        selectLKAnchor(lk.side, lk.idx);
      });
      const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      line.setAttribute('x1', tailX);
      line.setAttribute('y1', tailY);
      line.setAttribute('x2', tipX);
      line.setAttribute('y2', tipY);
      line.setAttribute('stroke-width', Math.max(1.4, size * 0.05));
      g.appendChild(line);
      /* Arrowhead at tip. */
      const H = size * 0.20, W = size * 0.12;
      const bx = tipX - nx * H, by = tipY - ny * H;
      const px = -ny, py = nx;
      const p1 = [bx + px * W, by + py * W];
      const p2 = [bx - px * W, by - py * W];
      const head = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
      head.setAttribute('class', 'head');
      head.setAttribute('points', `${tipX},${tipY} ${p1[0]},${p1[1]} ${p2[0]},${p2[1]}`);
      g.appendChild(head);
      /* Sum label near the tail. */
      const labX = tailX - nx * (size * 0.4);
      const labY = tailY - ny * (size * 0.4);
      const t = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      t.setAttribute('class', 'lk-sum');
      t.setAttribute('x', labX);
      t.setAttribute('y', labY);
      t.setAttribute('text-anchor', 'middle');
      t.setAttribute('dominant-baseline', 'middle');
      t.setAttribute('font-size', Math.max(10, size * 0.34));
      t.textContent = String(lk.sum);
      g.appendChild(t);
      svg.appendChild(g);
    });

    grid.appendChild(svg);
  }

  /* Column / Row index cell marks: subtle background tint via cell classes.
     Always visible (not just while the tool is active) so users see which
     cells participate. */
  function drawIndexCells() {
    const N = state.puzzle.N;
    const col = state.puzzle.colIndex || new Int8Array(N * N);
    const row = state.puzzle.rowIndex || new Int8Array(N * N);
    for (let i = 0; i < N * N; i++) {
      const c = state.dom.cells[i]; if (!c) continue;
      c.classList.remove('col-index', 'row-index');
      if (col[i]) c.classList.add('col-index');
      if (row[i]) c.classList.add('row-index');
    }
  }

  /* Hitpoint per-cell arrows: 8 possible directions, drawn as small
     arrowheads around the cell centre. */
  function drawHitpointArrows() {
    const N = state.puzzle.N;
    const list = state.puzzle.hitpoints || [];
    const size = state.dom.cellSize;
    const total = N * size;
    const grid = state.dom.grid;
    grid.querySelectorAll('.hp-svg').forEach(n => n.remove());
    if (!list.length) return;

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'hp-svg');
    svg.setAttribute('width', total);
    svg.setAttribute('height', total);
    svg.setAttribute('viewBox', `0 0 ${total} ${total}`);

    const DIRS = self.HitpointHelpers ? self.HitpointHelpers.DIRS : [
      [-1,0],[-1,1],[0,1],[1,1],[1,0],[1,-1],[0,-1],[-1,-1],
    ];

    for (const hp of list) {
      const r = (hp.cell / N) | 0, c = hp.cell % N;
      const cx = c * size + size / 2, cy = r * size + size / 2;
      for (let d = 0; d < 8; d++) {
        if (!(hp.dirs & (1 << d))) continue;
        const [dr, dc] = DIRS[d];
        const len = Math.hypot(dr, dc);
        const ux = dc / len, uy = dr / len;
        /* Draw a small arrow from cell edge inward, then head at the tip
           pointing outward (in direction (ux, uy)). */
        const R = size * 0.42;       /* tip distance from centre */
        const L = size * 0.24;       /* arrow length */
        const tipX = cx + ux * R, tipY = cy + uy * R;
        const tailX = cx + ux * (R - L), tailY = cy + uy * (R - L);
        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line.setAttribute('class', 'hp-shaft');
        line.setAttribute('x1', tailX);
        line.setAttribute('y1', tailY);
        line.setAttribute('x2', tipX);
        line.setAttribute('y2', tipY);
        line.setAttribute('stroke-width', Math.max(1.2, size * 0.05));
        svg.appendChild(line);
        const H = size * 0.10, W = size * 0.07;
        const bx = tipX - ux * H, by = tipY - uy * H;
        const px = -uy, py = ux;
        const p1 = [bx + px * W, by + py * W];
        const p2 = [bx - px * W, by - py * W];
        const head = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
        head.setAttribute('class', 'hp-head');
        head.setAttribute('points', `${tipX},${tipY} ${p1[0]},${p1[1]} ${p2[0]},${p2[1]}`);
        svg.appendChild(head);
      }
    }
    grid.appendChild(svg);
  }

  /* Extra region overlay: for each region, tint every cell in that region
     via a per-cell CSS variable + inset dashed outline (like a cage but
     without a sum). Multiple regions may share cells — later regions
     replace earlier tints on shared cells; the outlines still show the
     boundary of each separately. */
  function drawExtraRegions() {
    const { N } = state.puzzle;
    const list = state.puzzle.extraRegions || [];
    const size = state.dom.cellSize;
    const total = N * size;
    const grid = state.dom.grid;
    grid.querySelectorAll('.er-svg').forEach(n => n.remove());
    /* Reset per-cell tint. */
    state.dom.cells.forEach(c => {
      if (!c) return;
      c.style.removeProperty('--extra-region-bg');
      c.classList.remove('extra-region-tinted');
    });
    /* Apply tint (last-wins so hovering the most-recent region reads clearly). */
    list.forEach(er => {
      const color = extraRegionColor(er.color | 0);
      for (const i of er.cells) {
        const cell = state.dom.cells[i]; if (!cell) continue;
        cell.style.setProperty('--extra-region-bg', color);
        cell.classList.add('extra-region-tinted');
      }
    });
    /* Draft (current tool) also tints for visual feedback. */
    if (state.tool === 'extraRegion' && state.erDraft.cells.length) {
      const color = extraRegionColor(state.erColor | 0);
      for (const i of state.erDraft.cells) {
        const cell = state.dom.cells[i]; if (!cell) continue;
        cell.style.setProperty('--extra-region-bg', color);
        cell.classList.add('extra-region-tinted');
      }
    }
    /* SVG outlines for both saved regions and the draft. */
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'er-svg');
    svg.setAttribute('width', total);
    svg.setAttribute('height', total);
    svg.setAttribute('viewBox', `0 0 ${total} ${total}`);
    list.forEach(er => {
      addCageOutline(svg, er.cells, size, 'extra-region');
    });
    if (state.tool === 'extraRegion' && state.erDraft.cells.length) {
      addCageOutline(svg, state.erDraft.cells, size, 'extra-region draft');
    }
    grid.appendChild(svg);
  }

  /* Count-circle overlay: draw an outlined circle inside each marked cell. */
  function drawCountCircles() {
    const N = state.puzzle.N;
    const cc = state.puzzle.countCircles;
    const size = state.dom.cellSize;
    const total = N * size;
    const grid = state.dom.grid;
    grid.querySelectorAll('.cc-svg').forEach(n => n.remove());
    if (!cc) return;
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'cc-svg');
    svg.setAttribute('width', total);
    svg.setAttribute('height', total);
    svg.setAttribute('viewBox', `0 0 ${total} ${total}`);
    for (let i = 0; i < cc.length; i++) {
      if (!cc[i]) continue;
      const r = (i / N) | 0, c = i % N;
      const cx = c * size + size / 2, cy = r * size + size / 2;
      const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      circle.setAttribute('class', 'cc-ring');
      circle.setAttribute('cx', cx);
      circle.setAttribute('cy', cy);
      circle.setAttribute('r', size * 0.36);
      svg.appendChild(circle);
    }
    grid.appendChild(svg);
  }

  /* Slow-thermo overlay — same shape as thermometer but with a distinct
     stroke color so users can tell them apart. */
  function drawSlowThermos() {
    const { N, slowThermos } = state.puzzle;
    const size = state.dom.cellSize;
    const total = N * size;
    const grid = state.dom.grid;
    grid.querySelectorAll('.slow-svg').forEach(n => n.remove());
    const list = slowThermos || [];
    if (!list.length && state.tool !== 'slowThermo') return;

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'slow-svg');
    svg.setAttribute('width', total);
    svg.setAttribute('height', total);
    svg.setAttribute('viewBox', `0 0 ${total} ${total}`);

    const drawOne = (path, active) => {
      if (!path.length) return;
      const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      g.setAttribute('class', 'slow-group' + (active ? ' active' : ''));
      const centers = path.map(i => {
        const r = (i / N) | 0, c = i % N;
        return [c * size + size / 2, r * size + size / 2];
      });
      const bulb = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      bulb.setAttribute('class', 'bulb');
      bulb.setAttribute('cx', centers[0][0]);
      bulb.setAttribute('cy', centers[0][1]);
      bulb.setAttribute('r', size * 0.34);
      g.appendChild(bulb);
      if (centers.length > 1) {
        const pts = centers.map(p => `${p[0]},${p[1]}`).join(' ');
        const line = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
        line.setAttribute('class', 'stem');
        line.setAttribute('points', pts);
        line.setAttribute('stroke-width', size * 0.22);
        line.setAttribute('stroke-linecap', 'round');
        line.setAttribute('stroke-linejoin', 'round');
        g.appendChild(line);
      }
      svg.appendChild(g);
    };
    list.forEach(t => drawOne(t, false));
    if (state.tool === 'slowThermo') drawOne(state.lineDraft.cells, true);
    grid.appendChild(svg);
  }

  /* Between / lockout / sequence lines. Sequence just draws a plain line;
     between/lockout draw a line with special end markers (open circle for
     between, diamond for lockout). */
  function drawBetweenLikeLines() {
    const { N, betweenLines, lockoutLines, sequenceLines } = state.puzzle;
    const size = state.dom.cellSize;
    const total = N * size;
    const grid = state.dom.grid;
    grid.querySelectorAll('.blk-svg').forEach(n => n.remove());
    const bs = betweenLines || [];
    const ls = lockoutLines || [];
    const ss = sequenceLines || [];
    if (!bs.length && !ls.length && !ss.length &&
        !['between', 'lockout', 'sequence'].includes(state.tool)) return;

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'blk-svg');
    svg.setAttribute('width', total);
    svg.setAttribute('height', total);
    svg.setAttribute('viewBox', `0 0 ${total} ${total}`);

    const centerOf = i => {
      const r = (i / N) | 0, c = i % N;
      return [c * size + size / 2, r * size + size / 2];
    };
    const drawLine = (path, cls, active) => {
      if (path.length < 1) return;
      const pts = path.map(centerOf);
      const pline = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
      pline.setAttribute('class', 'blk-line ' + cls + (active ? ' active' : ''));
      pline.setAttribute('points', pts.map(p => p.join(',')).join(' '));
      pline.setAttribute('stroke-width', size * 0.14);
      pline.setAttribute('stroke-linecap', 'round');
      pline.setAttribute('stroke-linejoin', 'round');
      svg.appendChild(pline);
      if (cls === 'between' || cls === 'lockout') {
        /* Endpoint markers: circle for between, diamond for lockout. */
        const first = pts[0], last = pts[pts.length - 1];
        for (const p of [first, last]) {
          if (cls === 'between') {
            const c = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
            c.setAttribute('class', 'blk-cap between');
            c.setAttribute('cx', p[0]);
            c.setAttribute('cy', p[1]);
            c.setAttribute('r', size * 0.30);
            svg.appendChild(c);
          } else {
            const d = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
            d.setAttribute('class', 'blk-cap lockout');
            const R = size * 0.28;
            d.setAttribute('points',
              `${p[0]},${p[1]-R} ${p[0]+R},${p[1]} ${p[0]},${p[1]+R} ${p[0]-R},${p[1]}`);
            svg.appendChild(d);
          }
        }
      }
    };

    bs.forEach(l => drawLine(l, 'between', false));
    ls.forEach(l => drawLine(l, 'lockout', false));
    ss.forEach(l => drawLine(l, 'sequence', false));
    /* Preview for in-progress draft. */
    if (state.tool === 'between')  drawLine(state.lineDraft.cells, 'between',  true);
    if (state.tool === 'lockout')  drawLine(state.lineDraft.cells, 'lockout',  true);
    if (state.tool === 'sequence') drawLine(state.lineDraft.cells, 'sequence', true);

    grid.appendChild(svg);
  }

  /* Pencilmark overlay: only rendered when state.pencilmarkOn is true and
     stats have been computed. */
  function drawPencilmarks() {
    const N = state.puzzle.N;
    const size = state.dom.cellSize;
    const total = N * size;
    const grid = state.dom.grid;
    grid.querySelectorAll('.pm-svg').forEach(n => n.remove());
    /* Clear any pm-confirmed classes from cells regardless of state. */
    state.dom.cells.forEach(c => { if (c) c.classList.remove('pm-confirmed'); });
    if (!state.pencilmarkOn || !state.pencilmarkStats) return;

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'pm-svg');
    svg.setAttribute('width', total);
    svg.setAttribute('height', total);
    svg.setAttribute('viewBox', `0 0 ${total} ${total}`);

    const { freq, solCount } = state.pencilmarkStats;
    const rowsForN = Math.ceil(Math.sqrt(N));
    const colsForN = Math.ceil(N / rowsForN);

    for (let i = 0; i < N * N; i++) {
      if (state.puzzle.values[i]) continue;   /* givens already show */
      const offs = i * (N + 1);
      /* Count non-zero digits + find max freq. */
      let distinct = 0, singleV = 0, maxF = 0;
      for (let v = 1; v <= N; v++) {
        const f = freq[offs + v];
        if (f > 0) { distinct++; singleV = v; if (f > maxF) maxF = f; }
      }
      if (distinct === 0) continue;
      const r = (i / N) | 0, c = i % N;
      if (distinct === 1) {
        /* Confirmed value across every solution — mark the cell + drop the
           digit in as a green placeholder. */
        const cell = state.dom.cells[i];
        if (cell) {
          cell.classList.add('pm-confirmed');
          cell.placeholder = digitToChar(singleV);
        }
        continue;
      }
      /* Multi-candidate: draw each in a small grid within the cell. */
      let slot = 0;
      for (let v = 1; v <= N; v++) {
        const f = freq[offs + v];
        if (!f) { slot++; continue; }
        const rr = (slot / colsForN) | 0, cc = slot % colsForN;
        slot++;
        const px = c * size + (cc + 0.5) * (size / colsForN);
        const py = r * size + (rr + 0.5) * (size / rowsForN);
        const t = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        t.setAttribute('class', 'pm-digit');
        t.setAttribute('x', px);
        t.setAttribute('y', py);
        t.setAttribute('text-anchor', 'middle');
        t.setAttribute('dominant-baseline', 'central');
        t.setAttribute('font-size', Math.max(7, size * (N > 9 ? 0.18 : 0.22)));
        /* Frequency-weighted opacity: least frequent = 0.3, most = 1.0. */
        const alpha = 0.3 + 0.7 * (f / (maxF || 1));
        t.setAttribute('opacity', alpha.toFixed(2));
        t.textContent = digitToChar(v);
        svg.appendChild(t);
      }
    }
    grid.appendChild(svg);
  }

  /* ---------- Cell interaction dispatch ---------- */
  function attachCellHandlers(input, i) {
    input.addEventListener('focus', () => {
      input.select();
    });

    input.addEventListener('mousedown', e => {
      if (state.tool === 'region') { e.preventDefault(); state.regionDrag = true; paintRegionLight(i); }
      else if (state.tool === 'rainbow') { e.preventDefault(); state.rainbowDrag = true; paintRainbowLight(i); }
      else if (state.tool === 'cage') { e.preventDefault(); beginCageDrag(i); }
      else if (state.tool === 'extraRegion') { e.preventDefault(); beginERDrag(i); }
      else if (state.tool === 'thermo') { e.preventDefault(); state.pathDrag = true; addThermoCellLight(i); }
      else if (LINE_TOOLS.has(state.tool)) {
        e.preventDefault(); state.pathDrag = true; addLineCellLight(i);
      }
      else if (state.tool === 'arrow') { e.preventDefault(); state.pathDrag = true; addArrowCellLight(i); }
      else if (state.tool === 'quadruple') { e.preventDefault(); handleQuadClick(i); }
      else if (state.tool === 'kropki') { e.preventDefault(); handleKropkiClick(i); }
      else if (state.tool === 'compare') { e.preventDefault(); handleCompareClick(i); }
      else if (state.tool === 'xv') { e.preventDefault(); handleXVClick(i); }
      else if (state.tool === 'parity') { e.preventDefault(); state.parityDrag = true; paintParityLight(i); }
      else if (state.tool === 'colIndex') { e.preventDefault(); state.colIndexDrag = true; paintIndexLight(i, 'colIndex'); }
      else if (state.tool === 'rowIndex') { e.preventDefault(); state.rowIndexDrag = true; paintIndexLight(i, 'rowIndex'); }
      else if (state.tool === 'hitpoint') { e.preventDefault(); handleHitpointClick(i); }
      else if (state.tool === 'countCircle') { e.preventDefault(); state.ccDrag = null; paintCountCircleLight(i); }
      else if (state.tool === 'grid') { e.preventDefault(); toggleDeletedCell(i); }
    });
    input.addEventListener('mouseenter', () => {
      if (state.tool === 'cage' && state.cageDrag) applyCageDrag(i);
      else if (state.tool === 'extraRegion' && state.erDrag) applyERDrag(i);
      else if (state.tool === 'region' && state.regionDrag) paintRegionLight(i);
      else if (state.tool === 'rainbow' && state.rainbowDrag) paintRainbowLight(i);
      else if (state.tool === 'thermo' && state.pathDrag) addThermoCellLight(i);
      else if (state.pathDrag && LINE_TOOLS.has(state.tool)) addLineCellLight(i);
      else if (state.tool === 'arrow' && state.pathDrag) addArrowCellLight(i);
      else if (state.tool === 'parity' && state.parityDrag) paintParityLight(i);
      else if (state.tool === 'colIndex' && state.colIndexDrag) paintIndexLight(i, 'colIndex');
      else if (state.tool === 'rowIndex' && state.rowIndexDrag) paintIndexLight(i, 'rowIndex');
      else if (state.tool === 'countCircle' && state.ccDrag != null) paintCountCircleLight(i);
    });

    input.addEventListener('keydown', e => {
      const N = state.puzzle.N;
      const idx = i;
      const pz = state.puzzle;
      const nRows = pz.rows != null ? pz.rows : N;
      const nCols = pz.cols != null ? pz.cols : N;
      const focusIf = (target) => { const c = state.dom.cells[target]; if (c) c.focus(); };
      if (e.key === 'ArrowRight' && idx % nCols < nCols - 1) { e.preventDefault(); focusIf(idx + 1); return; }
      if (e.key === 'ArrowLeft'  && idx % nCols > 0)         { e.preventDefault(); focusIf(idx - 1); return; }
      if (e.key === 'ArrowDown'  && idx < nCols * (nRows - 1)) { e.preventDefault(); focusIf(idx + nCols); return; }
      if (e.key === 'ArrowUp'    && idx >= nCols)              { e.preventDefault(); focusIf(idx - nCols); return; }
      if (state.tool !== 'digit') { e.preventDefault(); return; }
      if (e.key === 'Backspace' || e.key === 'Delete') {
        e.preventDefault();
        state.puzzle.values[idx] = 0;
        state.puzzle.given[idx] = 0;
        input.value = '';
        input.classList.remove('given');
        analyze();
        return;
      }
      if (isDigitKey(e.key, N)) {
        e.preventDefault();
        const v = charToDigit(e.key);
        state.puzzle.values[idx] = v;
        state.puzzle.given[idx] = 1;
        input.value = digitToChar(v);
        input.classList.add('given');
        analyze();
        return;
      }
      if (e.key === 'Tab' || e.key === 'Enter' || e.metaKey || e.ctrlKey || e.altKey) return;
      e.preventDefault();
    });

    input.addEventListener('input', e => {
      const N = state.puzzle.N;
      const raw = e.target.value.toUpperCase();
      const v = charToDigit(raw);
      if (v >= 1 && v <= N) {
        state.puzzle.values[i] = v;
        state.puzzle.given[i] = 1;
        input.value = digitToChar(v);
        input.classList.add('given');
      } else {
        state.puzzle.values[i] = 0;
        state.puzzle.given[i] = 0;
        input.value = '';
        input.classList.remove('given');
      }
      analyze();
    });
  }

  function paintRegion(i) {
    paintRegionLight(i);
    analyze();
  }
  /* Update one cell's region without a full rebuild — recolors the tinted
     background and recomputes jigsaw borders for the touched cell and its
     four orthogonal neighbours (borders depend on both sides). */
  function paintRegionLight(i) {
    const p = state.puzzle;
    /* Custom regions and disjoint groups are mutually exclusive — see
       buildFlagRow. Auto-disable disjoint when the user starts painting a
       custom region (a quiet mutex rather than a modal). */
    if (p.flags && p.flags.disjoint) p.flags.disjoint = false;
    /* Deleted cells never take a region assignment. */
    if (p.deleted && p.deleted[i]) return;
    if (p.regions[i] === state.regionPick) return;
    p.regions[i] = state.regionPick;
    const N = p.N;
    const nRows = p.rows != null ? p.rows : N;
    const nCols = p.cols != null ? p.cols : N;
    const grid = state.dom.grid;
    grid.classList.toggle('jigsaw', hasCustomRegions());
    const jig = grid.classList.contains('jigsaw');
    const theme = AppTheme.get();
    const touch = [i];
    const r = (i / nCols) | 0, c = i % nCols;
    if (r > 0)         touch.push(i - nCols);
    if (r < nRows - 1) touch.push(i + nCols);
    if (c > 0)         touch.push(i - 1);
    if (c < nCols - 1) touch.push(i + 1);
    /* Neighbour "region id" for border-comparison purposes: out-of-grid
       and deleted cells count as "outside" (a distinct id) so an unassigned
       cell touching a deleted cell still gets a border, but two unassigned
       cells adjacent to each other DO NOT. */
    const neighReg = (kr, kc) => {
      if (kr < 0 || kr >= nRows || kc < 0 || kc >= nCols) return -2;
      const nk = kr * nCols + kc;
      if (p.deleted && p.deleted[nk]) return -2;
      return p.regions[nk];
    };
    for (const k of touch) {
      const cell = state.dom.cells[k]; if (!cell) continue;
      cell.classList.remove('bx-t','bx-b','bx-l','bx-r',
                            'bx-t-outer','bx-b-outer','bx-l-outer','bx-r-outer');
      const kr = (k / nCols) | 0, kc = k % nCols;
      cell.style.setProperty('--region-bg', p.regions[k] >= 0 ? regionColor(p.regions[k], theme) : 'transparent');
      /* Match the border-decision from buildCells so incremental repaints
         stay in sync with the full-render logic. */
      const kReg = p.regions[k];
      const chooseSide = (kr2, kc2, side) => {
        const outside = (kr2 < 0 || kr2 >= nRows || kc2 < 0 || kc2 >= nCols)
                        || (p.deleted && p.deleted[kr2 * nCols + kc2]);
        if (outside) {
          if (kReg < 0) return null;
          return 'bx-' + side + '-outer';
        }
        const nr = p.regions[kr2 * nCols + kc2];
        if (kReg < 0 && nr < 0) return null;
        if (kReg === nr) return null;
        return 'bx-' + side;
      };
      if (jig) {
        const tt = chooseSide(kr-1, kc, 't'); if (tt) cell.classList.add(tt);
        const ll = chooseSide(kr, kc-1, 'l'); if (ll) cell.classList.add(ll);
        const bb = chooseSide(kr+1, kc, 'b'); if (bb) cell.classList.add(bb);
        const rr2 = chooseSide(kr, kc+1, 'r'); if (rr2) cell.classList.add(rr2);
      } else {
        if ((kc + 1) % p.boxC === 0 && kc !== nCols - 1) cell.classList.add('bx-r');
        if (kc > 0 && kc % p.boxC === 0)                 cell.classList.add('bx-l');
        if ((kr + 1) % p.boxR === 0 && kr !== nRows - 1) cell.classList.add('bx-b');
        if (kr > 0 && kr % p.boxR === 0)                 cell.classList.add('bx-t');
        if (kr === 0)         cell.classList.add('bx-t-outer');
        if (kc === 0)         cell.classList.add('bx-l-outer');
        if (kr === nRows - 1) cell.classList.add('bx-b-outer');
        if (kc === nCols - 1) cell.classList.add('bx-r-outer');
      }
    }
  }

  /* Find the finalized-cage index containing cell `i`, or -1. */
  function cageIndexAt(i) {
    const cs = state.puzzle.cages;
    for (let k = 0; k < cs.length; k++) if (cs[k].cells.includes(i)) return k;
    return -1;
  }

  /* Mousedown on a cell in cage mode:
     - If the cell belongs to a finalized cage, "unfreeze" it: pop that cage
       out of the puzzle and load its cells + sum into the draft so both the
       shape and the sum can be edited. Drag mode is then 'add'.
     - Otherwise, drag mode is 'add' when the cell is not yet in the draft,
       'remove' when it is. */
  function beginCageDrag(i) {
    const existing = cageIndexAt(i);
    if (existing >= 0) {
      /* If a different draft is in progress, commit it first so the user
         doesn't lose their in-progress selection. */
      if (state.cageDraft.cells.length) finishCage();
      const cage = state.puzzle.cages.splice(existing, 1)[0];
      state.cageDraft = { cells: [...cage.cells], sum: cage.sum == null ? '' : String(cage.sum) };
      state.cageDrag = { mode: 'add' };
      rebuild();
      return;
    }
    const draftHas = state.cageDraft.cells.indexOf(i) >= 0;
    state.cageDrag = { mode: draftHas ? 'remove' : 'add' };
    applyCageDrag(i);
  }

  function applyCageDrag(i) {
    if (!state.cageDrag) return;
    /* Never sweep into cells owned by another finalized cage. */
    if (cageIndexAt(i) >= 0) return;
    const arr = state.cageDraft.cells;
    const at = arr.indexOf(i);
    if (state.cageDrag.mode === 'add' && at < 0) arr.push(i);
    else if (state.cageDrag.mode === 'remove' && at >= 0) arr.splice(at, 1);
    else return;
    /* Light refresh — avoid rebuilding the whole page so the drag stays live. */
    fillToolPanel();
    drawCages();
  }

  function endCageDrag() {
    if (!state.cageDrag) return;
    state.cageDrag = null;
    /* Re-run analysis once at the end of the drag. */
    analyze();
  }

  function addThermoCell(i) { addThermoCellLight(i); }
  function addThermoCellLight(i) {
    const arr = state.thermoDraft.cells;
    const N = state.puzzle.N;
    if (arr.length === 0) { arr.push(i); refreshPathOverlays(); return; }
    if (arr[arr.length - 1] === i) return;
    const prev = arr[arr.length - 1];
    const dr = Math.abs(((i / N) | 0) - ((prev / N) | 0));
    const dc = Math.abs((i % N) - (prev % N));
    if (dr <= 1 && dc <= 1 && (dr + dc) > 0 && arr.indexOf(i) === -1) {
      arr.push(i);
      refreshPathOverlays();
    }
  }

  /* Shared path builder for whisper / region-sum / modular lines.
     Extensions may step to any of the 8 king-move neighbours (orthogonal
     OR diagonal) — the constraints are stated for consecutive cells along
     the line, and the solver treats the pair-list agnostically, so
     diagonal steps carry the same semantics as orthogonal ones. */
  function addLineCell(i) { addLineCellLight(i); }
  function addLineCellLight(i) {
    const arr = state.lineDraft.cells;
    if (arr.length === 0) { arr.push(i); refreshPathOverlays(); return; }
    if (arr[arr.length - 1] === i) return;
    const N = state.puzzle.N;
    const prev = arr[arr.length - 1];
    const dr = Math.abs(((i / N) | 0) - ((prev / N) | 0));
    const dc = Math.abs((i % N) - (prev % N));
    if (dr <= 1 && dc <= 1 && (dr + dc) > 0 && arr.indexOf(i) === -1) {
      arr.push(i);
      refreshPathOverlays();
    }
  }

  /* Redraw the SVG overlays and per-cell `.sel` outlines during a drag,
     without rebuilding the whole grid. Also refresh the tool panel so the
     "path length" counter stays in sync. */
  function refreshPathOverlays() {
    drawThermos();
    drawLines();
    drawArrows();
    state.dom.cells.forEach(c => { if (c) c.classList.remove('sel', 'sel-t', 'sel-b', 'sel-l', 'sel-r'); });
    if (state.tool === 'thermo') applySelEdges(state.thermoDraft.cells);
    else if (LINE_TOOLS.has(state.tool)) applySelEdges(state.lineDraft.cells);
    else if (state.tool === 'arrow') applySelEdges(state.arrowDraft.base.concat(state.arrowDraft.path));
    fillToolPanel();
  }

  /* Kropki click: two consecutive clicks on orthogonally-adjacent cells
     toggle a dot of the current kind. Clicking the same cell twice cancels
     the pending pair. */
  function handleKropkiClick(i) {
    if (state.kropkiFirst === -1) {
      state.kropkiFirst = i;
      rebuild();
      return;
    }
    if (state.kropkiFirst === i) {
      state.kropkiFirst = -1;
      rebuild();
      return;
    }
    const N = state.puzzle.N;
    const a = state.kropkiFirst, b = i;
    const dr = Math.abs(((a / N) | 0) - ((b / N) | 0));
    const dc = Math.abs((a % N) - (b % N));
    if (dr + dc !== 1) {
      /* Non-adjacent → restart selection from the new cell. */
      state.kropkiFirst = i;
      rebuild();
      return;
    }
    const kind = state.kropkiKind;
    const [x, y] = a < b ? [a, b] : [b, a];
    const list = state.puzzle.kropki;
    const found = list.findIndex(d => d.a === x && d.b === y);
    if (found >= 0) {
      if (list[found].kind === kind) list.splice(found, 1);   /* same kind → remove */
      else list[found].kind = kind;                            /* different kind → flip */
    } else {
      list.push({ a: x, b: y, kind });
    }
    state.kropkiFirst = -1;
    rebuild();
  }

  /* Shared two-click pair handler for edge-based marks (compare / XV).
     `opts`:
       - firstKey:  state field storing the first-clicked cell
       - kindKey:   state field storing the current kind selector
       - listKey:   puzzle field holding the list of {a,b,kind}
       - directed:  true if (a,b) and (b,a) are semantically different (compare)
       - onFlipKind:function(existing, kind) → 'keep'|'replace'|'remove'
     Returns nothing; mutates state and rebuilds. */
  function handleEdgePairClick(i, listKey, firstKey, kindKey, directed, redraw) {
    if (state[firstKey] === -1) { state[firstKey] = i; rebuild(); return; }
    if (state[firstKey] === i)  { state[firstKey] = -1; rebuild(); return; }
    const N = state.puzzle.N;
    const a0 = state[firstKey], b0 = i;
    const dr = Math.abs(((a0 / N) | 0) - ((b0 / N) | 0));
    const dc = Math.abs((a0 % N) - (b0 % N));
    if (dr + dc !== 1) { state[firstKey] = i; rebuild(); return; }
    const list = state.puzzle[listKey];
    const kind = state[kindKey];
    let a = a0, b = b0, useKind = kind;
    if (!directed) {                                   /* canonical ordering for unordered pairs */
      if (a > b) { [a, b] = [b, a]; }
    }
    const found = directed
      ? list.findIndex(d => (d.a === a && d.b === b) || (d.a === b && d.b === a))
      : list.findIndex(d => d.a === a && d.b === b);
    if (found >= 0) {
      const cur = list[found];
      const same = directed
        ? (cur.a === a && cur.b === b && cur.kind === kind)
        : (cur.kind === kind);
      if (same) list.splice(found, 1);
      else { cur.a = a; cur.b = b; cur.kind = useKind; }
    } else {
      list.push({ a, b, kind: useKind });
    }
    state[firstKey] = -1;
    rebuild();
  }

  function handleCompareClick(i) { handleEdgePairClick(i, 'compare', 'compareFirst', 'compareKind', true); }
  function handleXVClick(i)      { handleEdgePairClick(i, 'xv',      'xvFirst',      'xvKind',      false); }

  /* Spectradoku brush: assign the currently-selected color to a cell.
     Clicking a cell that already holds the same color clears it. Live-updates
     the cell's tint without a full rebuild. */
  function paintRainbowLight(i) {
    const p = state.puzzle;
    const pick = state.rainbowPick;
    const next = (p.rainbow[i] === pick) ? 0 : pick;
    if (p.rainbow[i] === next) return;
    p.rainbow[i] = next;
    const cell = state.dom.cells[i];
    if (cell) {
      if (next) cell.style.setProperty('--rainbow-bg', spectraColor(next - 1));
      else cell.style.removeProperty('--rainbow-bg');
      cell.classList.toggle('rainbow-tinted', !!next);
    }
    fillToolPanel();
  }

  /* Parity brush: apply the currently-selected parity kind. Clicking (or
     dragging onto) a cell already carrying that same kind clears it. */
  function paintParityLight(i) {
    const p = state.puzzle;
    const kind = state.parityKind;
    const cur = p.parity[i];
    const next = (cur === kind) ? 0 : kind;
    if (cur === next) return;
    p.parity[i] = next;
    drawParity();
  }

  /* Index brush: toggle marks for the column-index / row-index constraint.
     Dragging over an already-marked cell of the same kind clears it — mirrors
     the parity brush pattern. */
  function paintIndexLight(i, arrayKey) {
    const arr = state.puzzle[arrayKey];
    if (!arr) return;
    /* Drag semantics: the drag mode is decided on the first cell (paint or
       clear); enter/hover then honors that mode. We stash it on state so it
       survives across mouseenters. */
    const dragKey = arrayKey === 'colIndex' ? '__colIndexPaint' : '__rowIndexPaint';
    if (state[dragKey] == null) state[dragKey] = arr[i] ? 0 : 1;
    const target = state[dragKey];
    if (arr[i] === target) return;
    arr[i] = target;
    drawIndexCells();
  }

  /* ---------- URL-hash persistence ----------
   * New links use LZ-string's URL-safe base64 (compressToEncodedURIComponent).
   * That plus the compact JSON produced by Core.serialize shrinks a typical
   * 9×9 puzzle share URL from ~3 KB to ~200 chars. Legacy hashes written
   * with plain base64 still load — the loader tries LZ first and falls back
   * to base64 if the decompressed payload doesn't parse as JSON. */
  function saveToHash() {
    try {
      const json = Core.serialize(state.puzzle);
      const enc = LZString.compressToEncodedURIComponent(json);
      history.replaceState(null, '', '#p=' + enc);
    } catch (e) { /* history may fail in file://, non-fatal. */ }
  }
  function loadFromHash() {
    try {
      const m = /#p=([^&]+)/.exec(location.hash);
      if (!m) return null;
      const payload = m[1];
      /* Try LZ-string first (current scheme). */
      try {
        const json = LZString.decompressFromEncodedURIComponent(payload);
        if (json && json.startsWith('{')) return Core.deserialize(json);
      } catch (_) { /* fall through to legacy path */ }
      /* Legacy path: URL-safe base64 of UTF-8 JSON. */
      const b64 = payload.replace(/-/g, '+').replace(/_/g, '/');
      const json = decodeURIComponent(escape(atob(b64)));
      return Core.deserialize(json);
    } catch (e) { return null; }
  }

  function openOnSudokuPad() {
    if (typeof SudokuPadExport === 'undefined') {
      setStatus(L({
        en: 'SudokuPad export module not loaded.',
        zh: 'SudokuPad 导出模块未加载。',
      }), 'error');
      return;
    }
    try {
      const { url, dropped } = SudokuPadExport.buildLink(state.puzzle);
      window.open(url, '_blank', 'noopener');
      if (dropped && dropped.length) {
        setStatus(L({
          en: `Opened on SudokuPad. Not natively supported: ${dropped.join(', ')} — visuals kept where possible, logic dropped.`,
          zh: `已在 SudokuPad 打开。以下约束原生不支持：${dropped.join(', ')} — 尽量保留视觉，逻辑已丢弃。`,
        }));
      } else {
        setStatus(L({ en: 'Opened on SudokuPad.', zh: '已在 SudokuPad 打开。' }), 'ok');
      }
    } catch (e) {
      console.error(e);
      setStatus(L({
        en: 'Could not build SudokuPad link — see console.',
        zh: '无法生成 SudokuPad 链接 — 查看控制台。',
      }), 'error');
    }
  }

  /* ---------- Analyze (conflicts + optional solve) ---------- */
  function analyze() {
    state.solutionIdx = 0;
    state.solutions = [];
    state.reachedCap = false;
    /* Any edit invalidates the previous pencilmark analysis — turn it off
       so stale marks never reach the DOM. The button will re-enable itself
       through updateNav once the fresh solve returns. */
    state.pencilmarkOn = false;
    state.pencilmarkStats = null;
    if (state.dom.pencilBtn) state.dom.pencilBtn.classList.remove('active');
    saveToHash();

    /* Clear placeholders + errors. */
    state.dom.cells.forEach(c => { if (!c) return; c.classList.remove('error'); c.placeholder = ''; c.classList.remove('hint-only'); });

    const conflicts = Core.findConflicts(state.puzzle);
    if (conflicts.size > 0) {
      conflicts.forEach(i => { const c = state.dom.cells[i]; if (c) c.classList.add('error'); });
      setStatus(L({ en: `Conflict: ${conflicts.size} cells clash.`,
                    zh: `冲突：${conflicts.size} 个单元格重复。` }), 'err');
      updateNav();
      return;
    }

    if (!state.liveSolve) {
      setStatus(L({ en: 'Live solve off — press Solve to compute.',
                    zh: '实时求解关闭 — 按"求解"计算。' }));
      updateNav();
      return;
    }

    /* Skip solving an entirely empty puzzle — too many solutions to enumerate
       usefully. Ask for at least one clue or one variant constraint. */
    const hasGivens = Array.prototype.some.call(state.puzzle.values, v => !!v);
    const p = state.puzzle;
    const anyEdge = (obj) => ['top','bottom','left','right']
      .some(s => Array.prototype.some.call(obj[s], v => !!v));
    const hasVariant = p.cages.length || p.thermos.length ||
      (p.whispers && p.whispers.length) ||
      (p.regionSums && p.regionSums.length) ||
      (p.modulars && p.modulars.length) ||
      (p.renbans && p.renbans.length) ||
      (p.palindromes && p.palindromes.length) ||
      (p.entropics && p.entropics.length) ||
      (p.parityLines && p.parityLines.length) ||
      (p.arrows && p.arrows.length) ||
      (p.quadruples && p.quadruples.length) ||
      (p.kropki && p.kropki.length) ||
      (p.compare && p.compare.length) ||
      (p.xv && p.xv.length) ||
      (p.parity && Array.prototype.some.call(p.parity, v => !!v)) ||
      (p.rainbow && Array.prototype.some.call(p.rainbow, v => !!v)) ||
      (p.littleKillers && p.littleKillers.length) ||
      (p.colIndex && Array.prototype.some.call(p.colIndex, v => !!v)) ||
      (p.rowIndex && Array.prototype.some.call(p.rowIndex, v => !!v)) ||
      (p.hitpoints && p.hitpoints.length) ||
      (p.extraRegions && p.extraRegions.length) ||
      (p.slowThermos && p.slowThermos.length) ||
      (p.betweenLines && p.betweenLines.length) ||
      (p.lockoutLines && p.lockoutLines.length) ||
      (p.sequenceLines && p.sequenceLines.length) ||
      (p.countCircles && Array.prototype.some.call(p.countCircles, v => !!v)) ||
      p.flags.diagonal || p.flags.antiKnight || p.flags.antiKing || p.flags.antiConsecutive || p.flags.disjoint ||
      hasCustomRegions() ||
      anyEdge(p.sky) || anyEdge(p.sandwich) ||
      (p.xsum && anyEdge(p.xsum));
    if (!hasGivens && !hasVariant) {
      setStatus(L({ en: 'Add a given digit or a constraint to solve.',
                    zh: '请输入至少一个已知数字或添加一个约束。' }));
      updateNav();
      return;
    }
    runSolver(true);
  }

  /* --- Solver background thread ---------------------------------------
     The solver runs inside solver-worker.js so heavy solves don't freeze
     the UI. `solver` is a lazily-created singleton Worker. Every solve
     request gets a monotonically-increasing id; the response is ignored
     unless it matches the latest id (so stale results from superseded
     requests never overwrite the current view).

     Cancellation: Web Workers are single-threaded and can't be preempted
     mid-JS-turn. If a new request arrives while an old one is still
     grinding, we terminate the worker and spawn a new one — that's the
     only way to actually stop a runaway solve. When the worker is idle
     between requests, we keep it warm and just post the new message. */
  let solver = null;
  let solverBusy = false;
  let solverReqId = 0;
  let solverActiveId = 0;

  function spawnSolver() {
    solver = new Worker('solver-worker.js');
    solver.onmessage = onSolverMessage;
    solver.onerror   = e => {
      /* Worker crashed — surface it, then let the next request lazily
         respawn. Don't try to recover this specific solve. */
      console.error('solver-worker error', e);
      solverBusy = false;
      solver = null;
      setStatus(L({ en: 'Solver crashed — please try again.',
                    zh: '求解器崩溃 — 请再试一次。' }), 'err');
    };
  }

  function postSolve(triggeredByLive) {
    /* If a solve is already running, kill the worker so its result
       never lands. The freshly-spawned worker then gets our new task. */
    if (solverBusy && solver) {
      solver.terminate();
      solver = null;
      solverBusy = false;
    }
    if (!solver) spawnSolver();
    const id = ++solverReqId;
    solverActiveId = id;
    solverBusy = true;
    state.pendingLive = !!triggeredByLive;
    state.pendingStart = performance.now();
    setStatus(L({ en: 'Solving…', zh: '求解中…' }));
    /* structured clone handles TypedArrays and plain objects natively,
       so we can post the puzzle as-is; the worker gets its own copy. */
    solver.postMessage({ id, puzzle: state.puzzle });
  }

  function onSolverMessage(e) {
    const data = e.data;
    if (data.id !== solverActiveId) return;   /* stale response, ignore */
    solverBusy = false;
    if (data.error) {
      setStatus(L({ en: 'Solver error — see console.',
                    zh: '求解器出错 — 详见控制台。' }), 'err');
      console.error('solver-worker:', data.error);
      return;
    }
    if (data.invalidRegions) {
      setStatus(L({ en: 'Regions are incomplete — every region needs exactly N cells.',
                    zh: '宫格不完整 — 每个宫格必须恰好包含 N 格。' }), 'err');
      return;
    }
    state.solutions = data.solutions;
    state.reachedCap = data.reachedCap;
    state.solutionIdx = 0;
    renderSolution(data.dt);
    updateNav();
  }

  function runSolver(triggeredByLive) {
    /* Kept as the single entry point so both live-solve (analyze) and the
       manual "Solve" button reach the worker the same way. */
    postSolve(triggeredByLive);
  }

  function renderSolution(elapsedMs) {
    const { values, rainbow } = state.puzzle;
    /* Clear any previous derived Spectradoku tint from prior solves — user
       painted colors carry a `.rainbow-tinted` class from buildCells and
       are left alone; only cells with rainbow[i] === 0 may have gained the
       class as a solver hint, and those need to be reset before applying
       (or omitting) the new solution's colors. */
    state.dom.cells.forEach((c, i) => {
      if (!c) return;
      c.placeholder = '';
      c.classList.remove('hint-only');
      if (rainbow && !rainbow[i]) {
        c.classList.remove('rainbow-tinted', 'rainbow-derived');
        c.style.removeProperty('--rainbow-bg');
      }
    });

    if (state.solutions.length === 0) {
      setStatus(L({ en: 'No solution.', zh: '无解。' }), 'err');
      return;
    }
    const sol = state.solutions[state.solutionIdx];
    const solValues = sol.values;
    const solColors = sol.colors;   /* Int8Array when Spectradoku is active, else null */
    /* Pencilmark mode replaces per-cell placeholders with the multi-solution
       overlay drawn by drawPencilmarks — skip the single-solution hints
       so the two layers don't overlap. */
    const pm = state.pencilmarkOn;
    state.dom.cells.forEach((c, i) => {
      if (!c) return;
      if (!values[i] && !pm) { c.placeholder = digitToChar(solValues[i]); c.classList.add('hint-only'); }
      /* Spectradoku: paint the derived color on cells the user didn't paint,
         so every cell in the shown solution carries both digit and color. */
      if (solColors && rainbow && !rainbow[i]) {
        const co = solColors[i];
        if (co) {
          c.style.setProperty('--rainbow-bg', spectraColor(co - 1));
          c.classList.add('rainbow-tinted', 'rainbow-derived');
        }
      }
    });
    if (pm) drawPencilmarks();
    const total = state.solutions.length;
    const totalLabel = state.reachedCap ? '200+' : String(total);
    if (total === 1) {
      setStatus(L({ en: `1 solution (${elapsedMs} ms).`,
                    zh: `1 种解（${elapsedMs} ms）。` }), 'ok');
    } else {
      setStatus(L({
        en: `Solution ${state.solutionIdx + 1} of ${totalLabel} (${elapsedMs} ms).`,
        zh: `第 ${state.solutionIdx + 1} / ${totalLabel} 种解（${elapsedMs} ms）。`,
      }));
    }
  }

  function setStatus(text, kind) {
    const s = state.dom.status;
    s.textContent = text;
    s.className = 'solver-status' + (kind ? ' ' + kind : '');
  }
  function updateNav() {
    /* Solve controls are absent in Play mode (buildActions swaps them for the
       keypad); every button access below must be guarded. */
    if (!state.dom.prevBtn) return;
    const many = state.solutions.length > 1;
    /* Pencilmark mode shows candidates from every solution at once — the
       per-solution navigator has nothing to advance, so disable it there. */
    const pm = state.pencilmarkOn;
    state.dom.prevBtn.disabled = pm || !many || state.solutionIdx <= 0;
    state.dom.nextBtn.disabled = pm || !many || state.solutionIdx >= state.solutions.length - 1;
    if (state.dom.pencilBtn) {
      const n = state.solutions.length;
      const cap = state.reachedCap;
      const enabled = n >= 1 && n <= 196 && !cap;
      state.dom.pencilBtn.disabled = !enabled;
      if (!enabled && state.pencilmarkOn) {
        state.pencilmarkOn = false;
        state.pencilmarkStats = null;
        state.dom.pencilBtn.classList.remove('active');
      }
    }
  }

  /* Build per-cell candidate-frequency stats across every current solution.
     Returns { freq: Uint16Array(N*N*(N+1)), solCount } where
       freq[i*(N+1) + v] = # of solutions with values[i] === v (1..N)
     and index 0 is unused (kept for cheap indexing). */
  function computePencilmarkStats() {
    const N = state.puzzle.N;
    const total = N * N;
    const sols = state.solutions;
    const freq = new Uint16Array(total * (N + 1));
    for (const sol of sols) {
      const vals = sol.values;
      for (let i = 0; i < total; i++) {
        const v = vals[i];
        if (v >= 1 && v <= N) freq[i * (N + 1) + v]++;
      }
    }
    return { freq, solCount: sols.length };
  }

  /* ---------- Rebuild helpers ---------- */
  function rebuild() {
    render(state.container);
  }
  function rebuildToolUI() {
    /* Tab bar visual state */
    Object.keys(state.dom.tabs || {}).forEach(k => {
      state.dom.tabs[k].classList.toggle('active', k === state.tool);
    });
    fillToolPanel();
    /* Re-render just the grid so cage/thermo highlights + sky-edit borders update. */
    const grid = state.dom.grid;
    grid.innerHTML = '';
    buildCells(grid);
    /* Sky cells need editable/filled class recalculated → rebuild frame. */
    const parent = state.dom.frame.parentElement;
    parent.removeChild(state.dom.frame);
    buildGridFrame(parent);
    analyze();
  }

  let globalMouseUpAttached = false;
  function attachGlobalMouseUp() {
    if (globalMouseUpAttached) return;
    globalMouseUpAttached = true;
    const endAll = () => {
      if (!state) return;
      if (state.cageDrag) endCageDrag();
      if (state.regionDrag) { state.regionDrag = false; analyze(); }
      if (state.rainbowDrag) { state.rainbowDrag = false; analyze(); }
      if (state.pathDrag)   { state.pathDrag = false; analyze(); }
      if (state.parityDrag) { state.parityDrag = false; analyze(); }
      if (state.colIndexDrag) { state.colIndexDrag = false; state.__colIndexPaint = null; analyze(); }
      if (state.rowIndexDrag) { state.rowIndexDrag = false; state.__rowIndexPaint = null; analyze(); }
      if (state.erDrag) endERDrag();
      if (state.ccDrag != null) { state.ccDrag = null; analyze(); }
    };
    document.addEventListener('mouseup', endAll);
    document.addEventListener('mouseleave', endAll);
  }

  /* ---------- Top-level render ---------- */
  function render(container) {
    if (!state || state.container !== container) {
      state = makeState(container);
      const loaded = loadFromHash();
      if (loaded) state.puzzle = loaded;
    }
    container.innerHTML = '';
    state.dom = {};
    attachGlobalMouseUp();

    buildSizeControls(container);
    buildFlagRow(container);
    buildToolTabs(container);
    buildToolPanel(container);
    buildGridFrame(container);

    const status = el('p', 'solver-status');
    state.dom.status = status;
    container.appendChild(status);

    const actionsWrap = el('div', 'solver-actions-wrap');
    const solveRow = el('div', 'solver-actions');
    const manageRow = el('div', 'solver-actions');
    state.dom.prevBtn = btn(T.prev, {
      secondary: true,
      onClick: () => { if (state.solutionIdx > 0) { state.solutionIdx--; renderSolution(0); updateNav(); } },
    });
    state.dom.nextBtn = btn(T.next, {
      secondary: true,
      onClick: () => { if (state.solutionIdx < state.solutions.length - 1) { state.solutionIdx++; renderSolution(0); updateNav(); } },
    });
    const solveBtn = btn(T.solve, { onClick: runSolver });
    const liveChip = el('button', 'flag-chip' + (state.liveSolve ? ' active' : ''));
    liveChip._label = T.live;
    liveChip.textContent = L(T.live);
    liveChip.title = L({
      en: 'Live solve reruns the solver on every edit. Complex puzzles can hang the page — it will auto-disable if a run takes too long.',
      zh: '实时求解会在每次编辑后自动求解。复杂谜题会严重卡顿页面 — 若单次求解耗时过长将自动关闭。',
    });
    liveChip.addEventListener('click', () => {
      state.liveSolve = !state.liveSolve;
      liveChip.classList.toggle('active', state.liveSolve);
      analyze();
    });
    state.dom.liveChip = liveChip;
    const pencilBtn = el('button', 'flag-chip' + (state.pencilmarkOn ? ' active' : ''));
    pencilBtn._label = T.pencil;
    pencilBtn.textContent = L(T.pencil);
    pencilBtn.title = L({
      en: 'Analyze every solution and annotate cells with their candidates. Enabled when 1 <= solutions <= 196 and the solver cap is not reached.',
      zh: '分析所有解并在格子中标注候选数字。仅当解数在 1 到 196 之间且未达到求解上限时启用。',
    });
    pencilBtn.addEventListener('click', () => {
      if (pencilBtn.disabled) return;
      state.pencilmarkOn = !state.pencilmarkOn;
      pencilBtn.classList.toggle('active', state.pencilmarkOn);
      if (state.pencilmarkOn) {
        state.pencilmarkStats = computePencilmarkStats();
      } else {
        state.pencilmarkStats = null;
      }
      renderSolution(0);
      drawPencilmarks();
      updateNav();
    });
    state.dom.pencilBtn = pencilBtn;
    const resetBtn = btn(T.reset, {
      secondary: true,
      onClick: () => {
        state.puzzle.values.fill(0);
        state.puzzle.given.fill(0);
        rebuild();
      },
    });
    const exampleBtn = btn(T.example, {
      secondary: true,
      onClick: loadExample,
    });
    const wipeBtn = btn(T.wipe, {
      secondary: true,
      onClick: () => {
        const p = state.puzzle;
        state.puzzle = Core.newPuzzle(p.N, p.boxR, p.boxC);
        state.cageDraft = { cells: [], sum: '' };
        state.thermoDraft = { cells: [] };
        state.lineDraft = { cells: [] };
        state.arrowDraft = { phase: 0, base: [], path: [] };
        state.quadDraft = { digits: '' };
        state.kropkiFirst = -1;
        state.compareFirst = -1;
        state.xvFirst = -1;
        state.lkSelected = null;
        state.lkDraft = { dir: null, sum: '' };
        state.lkNotice = '';
        state.pencilmarkOn = false;
        state.pencilmarkStats = null;
        rebuild();
      },
    });
    const shareBtn = btn({ en: 'Copy link', zh: '复制链接' }, {
      secondary: true,
      onClick: () => {
        saveToHash();
        const url = location.href;
        try {
          navigator.clipboard.writeText(url);
          setStatus(L({ en: 'Link copied.', zh: '链接已复制。' }), 'ok');
        } catch (e) {
          setStatus(L({ en: 'Link is in the address bar.', zh: '链接在地址栏中。' }));
        }
      },
    });
    /* SudokuPad hand-off — the built-in play mode is gone; the button opens
       the puzzle on sudokupad.app in a new tab for the full play UX. */
    const sudokupadBtn = btn({ en: '▶ Play on SudokuPad', zh: '▶ 在 SudokuPad 上游玩' }, {
      onClick: openOnSudokuPad,
    });
    sudokupadBtn.title = L({
      en: 'Open this puzzle on sudokupad.app for the full play experience (timer, check, undo/redo, snapshots). Constraints not natively supported by SudokuPad are drawn as colored lines and explained in the puzzle description.',
      zh: '在 sudokupad.app 上打开此谜题以获得完整的游玩体验（计时、检查、撤销/重做、快照）。SudokuPad 不原生支持的约束以彩色线条绘制并在题目说明中解释。',
    });
    solveRow.append(solveBtn, state.dom.prevBtn, state.dom.nextBtn, liveChip, pencilBtn);
    manageRow.append(resetBtn, exampleBtn, shareBtn, sudokupadBtn, wipeBtn);
    actionsWrap.append(solveRow, manageRow);
    container.appendChild(actionsWrap);

    analyze();
  }


  function loadExample() {
    const N = state.puzzle.N;
    const ex = EXAMPLES[N];
    if (!ex) {
      setStatus(L({ en: `No example for ${N}×${N}.`, zh: `${N}×${N} 无示例。` }), 'err');
      return;
    }
    state.puzzle.values.fill(0);
    state.puzzle.given.fill(0);
    for (let i = 0; i < N * N; i++) {
      if (ex[i]) {
        state.puzzle.values[i] = ex[i];
        state.puzzle.given[i] = 1;
      }
    }
    rebuild();
  }

  return { name: NAME, description: DESCRIPTION, render };
})();
