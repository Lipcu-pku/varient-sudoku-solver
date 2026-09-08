/*
 * custom-rule-docs.js — bilingual reference manual for the "Custom
 * Constraints" tool. Loaded in the browser only; sudoku.js renders it into
 * a modal when the user clicks "API docs".
 *
 * Block types understood by the renderer:
 *   { t:'p',    en, zh }                      paragraph
 *   { t:'ul',   items:[{en, zh}, ...] }       bullet list
 *   { t:'code', code }                        pre-formatted code (same in both languages)
 *
 * The "examples" section is rendered by sudoku.js from
 * window.CustomRuleExamples so code lives in exactly one file.
 */
window.CustomRuleDocs = [
  {
    id: 'overview',
    title: { en: '1 · What is this?', zh: '1 · 这是什么' },
    blocks: [
      {
        t: 'p',
        en: 'Custom Constraints let you add a constraint that the built-in tools do not cover, by writing plain JavaScript. Each rule you write is enforced in two places: live, as you type digits into the grid (violating cells turn red), and inside the solver, which refuses placements that break the rule and rejects completed grids that fail it.',
        zh: '“自定义限制”让你用纯 JavaScript 编写内置工具没有的规则。每条规则都会在两个地方生效：一是实时生效——在盘面上输入数字时，违反规则的格子会标红；二是求解时生效——求解器会拒绝违反规则的填法，并筛掉不满足规则的完整解。',
      },
      {
        t: 'ul',
        items: [
          { en: 'You can add several rules; every enabled rule must pass (they combine with AND).', zh: '可以添加多条规则，所有启用中的规则必须同时满足（逻辑与）。' },
          { en: 'Rules are stored with the puzzle: they survive “Copy link” / share links and load back from a link.', zh: '规则随谜题一起保存：复制链接/分享时包含规则，打开链接会还原。' },
          { en: 'Rules are code — they are NOT exported to SudokuPad (the export notes this in the puzzle description).', zh: '规则是代码，导出到 SudokuPad 时不携带逻辑（导出会在题目说明中注明）。' },
          { en: 'Built-in sudoku rules (no repeats in row / column / box, cages, thermo, …) are still enforced by the engine. Write only your extra rule.', zh: '基础数独规则（行/列/宫不重复）以及其它内置约束仍由引擎强制执行，你只需编写额外的规则。' },
        ],
      },
    ],
  },
  {
    id: 'anatomy',
    title: { en: '2 · Anatomy of a rule', zh: '2 · 规则代码的结构' },
    blocks: [
      {
        t: 'p',
        en: 'The code editor holds the body of a JavaScript function. It must end with a `return { ... };` statement that hands back a “rule descriptor” object. While you type, the code is compiled on the fly: a green “✓ compiled” means the engine accepted it, a red message shows the syntax/type error.',
        zh: '代码编辑框中的内容是一个 JavaScript 函数体，必须以 `return { ... };` 语句结尾，返回一个“规则描述对象”。输入过程中代码会被实时编译：显示绿色“✓ 编译通过”表示引擎接受，红色文字则给出语法/类型错误。',
      },
      { t: 'code', code: '// 你的规则必须像这样 return 一个对象：\nreturn {\n  // 规则显示名（可选）\n  name: "My Rule",\n\n  // 可选：本次“会话”开始时调用一次，用于预计算（见第 4 节）\n  init(B) { /* ... */ },\n\n  // 可选：把数字 v 放入格子 i 前询问——返回 false 则拒绝\n  canPlace(i, v, B) { return true; },\n\n  // 可选：整盘填满后的最终校验——返回 false 则整盘作废\n  valid(B) { return true; },\n};' },
      {
        t: 'ul',
        items: [
          { en: '`name` — string, shown in messages. Optional.', zh: '`name` — 字符串，用于提示信息。可选。' },
          { en: '`init(B)` — called once before checking starts (every live re-check and every solve). Use it to precompute tables into local variables that your hooks capture. Optional.', zh: '`init(B)` — 开始校验前调用一次（每次实时校验、每次求解都会调用）。可在其中把预计算表存进局部变量，供钩子闭包使用。可选。' },
          { en: '`canPlace(i, v, B)` — the workhorse. Returns whether value v may be placed at cell i given the digits already on the board. Optional (default: allow).', zh: '`canPlace(i, v, B)` — 主力钩子。根据盘面上已有的数字，返回数字 v 是否允许放入格子 i。可选（缺省为允许）。' },
          { en: '`valid(B)` — final say over a COMPLETE grid (a finished solution, or your typed grid once the last cell is filled). Optional (default: allow).', zh: '`valid(B)` — 对“整盘填满”的最终裁决（完整解，或你填完最后一格时的盘面）。可选（缺省为允许）。' },
        ],
      },
      {
        t: 'p',
        en: 'Any top-level helper variables you declare before `return { ... }` are captured by the hooks (they live in the same closure). That is the recommended way to share precomputed data — see the “Center Sum 22” example.',
        zh: '在 `return { ... }` 之前声明的局部变量会被各钩子捕获（同处一个闭包），这是共享预计算数据的推荐方式——参见“中心四格和 22”示例。',
      },
    ],
  },
  {
    id: 'board',
    title: { en: '3 · The board handle B', zh: '3 · 棋盘对象 B' },
    blocks: [
      {
        t: 'p',
        en: 'Every hook receives B, a read-only description of the current grid. Cell indices are 0-based and computed as `i = r * B.cols + c`. Values are 1..N as numbers (digits beyond 9 are 10..16); 0 means empty. Deleted (hole) cells always read 0 and are never filled. Treat B as read-only — mutate nothing.',
        zh: '每个钩子都会收到 B——当前盘面的只读描述。格子编号从 0 开始：`i = r * B.cols + c`。数字是 1..N 的数值（大于 9 的数字为 10..16）；0 表示空格。被删除（空洞）的格子恒为 0，且永远不会被填数。请把 B 视为只读，不要修改任何内容。',
      },
      {
        t: 'ul',
        items: [
          { en: '`B.rows`, `B.cols` — grid dimensions.', zh: '`B.rows`、`B.cols` — 网格尺寸。' },
          { en: '`B.N` — digit count (max digit).', zh: '`B.N` — 数字个数（最大数字）。' },
          { en: '`B.total` — rows × cols.', zh: '`B.total` — 行数 × 列数。' },
          { en: '`B.values` — raw values array (`B.values[i]` = digit at i, 0 = empty).', zh: '`B.values` — 底层数字数组（`B.values[i]` = 格 i 的数字，0 = 空）。' },
          { en: '`B.deleted` — 0/1 array of holes (may be null).', zh: '`B.deleted` — 空洞标记数组 0/1（可能为 null）。' },
          { en: '`B.get(i)` or `B.get(r, c)` — digit at a cell.', zh: '`B.get(i)` 或 `B.get(r, c)` — 读取某格数字。' },
          { en: '`B.idx(r, c)` — index of cell (r, c).', zh: '`B.idx(r, c)` — 格 (r, c) 的编号。' },
          { en: '`B.row(i)`, `B.col(i)` — row / column of i.', zh: '`B.row(i)`、`B.col(i)` — 格 i 的行 / 列。' },
          { en: '`B.region(i)` — region id of i, or -1 when unassigned.', zh: '`B.region(i)` — 格 i 所属宫格编号，未分配时为 -1。' },
          { en: '`B.rowCells(r)`, `B.colCells(c)`, `B.regionCells(reg)` — arrays of cell indices.', zh: '`B.rowCells(r)`、`B.colCells(c)`、`B.regionCells(reg)` — 对应行/列/宫的所有格子编号数组。' },
          { en: '`B.ortho(i)` — orthogonal neighbours (up/down/left/right).', zh: '`B.ortho(i)` — 正交相邻格（上下左右）。' },
          { en: '`B.king(i)` — all 8 neighbours (orthogonal + diagonal).', zh: '`B.king(i)` — 八方向相邻格（含斜角）。' },
          { en: '`B.knight(i)` — knight-move neighbours.', zh: '`B.knight(i)` — 马步可达格。' },
        ],
      },
    ],
  },
  {
    id: 'semantics',
    title: { en: '4 · Semantics you must know', zh: '4 · 必须了解的语义' },
    blocks: [
      {
        t: 'p',
        en: 'canPlace is called for EVERY tentative placement during solving and for the cell you are typing in live mode. At that moment cell i is EMPTY in B; the other digits you see are already committed (typed givens, or placements the solver fixed earlier). Return false to reject v at i.',
        zh: '求解的每一步试探、以及你在实时模式下手动输入时，都会调用 canPlace。调用时格 i 在 B 中为空（0）；你能看到的其它数字都是已确定的（输入的数字，或求解器先前确定的填数）。返回 false 表示拒绝把 v 放进 i。',
      },
      {
        t: 'ul',
        items: [
          { en: 'Keep canPlace fast and PURE: read B, decide, return. Do not mutate B.values and do not keep state that changes between calls (compute once in init).', zh: 'canPlace 必须快且“纯”：只读 B、判断、返回。不要修改 B.values，也不要在两次调用之间保留可变状态（需要就放到 init 里一次性算好）。' },
          { en: 'valid is called only when every cell is filled. Because it cannot prune the search, a valid()-only rule makes the solver enumerate plain solutions and filter them — see §5 Performance.', zh: 'valid 只在整盘填满时调用。因为它无法在搜索中剪枝，只写 valid 的规则会让求解器先枚举普通解再过滤——参见第 5 节“性能”。' },
          { en: 'Compile errors or exceptions are never silently ignored: a broken rule is reported (rule name + message) and skipped; if it throws inside the solver, the solve aborts with that message.', zh: '编译错误或运行时异常绝不会被静默忽略：出错的规则会被提示（规则名 + 信息）并跳过；若在求解中抛错，求解会中止并显示该信息。' },
          { en: 'A rule with an empty code or with its checkbox unticked is skipped.', zh: '代码为空或未勾选启用（checkbox）的规则会被跳过。' },
          { en: 'Disabled rules stay in the list and are still shared via links — untick to switch off, delete to remove.', zh: '未启用的规则仍保留在列表中并随链接分享——取消勾选即停用，删除则移除。' },
          { en: 'Works for every grid size 4..16 and irregular/holey shapes; write with B.rows / B.cols / B.region instead of hard-coding 9.', zh: '适用于 4..16 任意尺寸及异形/带空洞盘面；请用 B.rows / B.cols / B.region 编写，不要硬编码 9。' },
        ],
      },
    ],
  },
  {
    id: 'perf',
    title: { en: '5 · Performance', zh: '5 · 性能' },
    blocks: [
      {
        t: 'p',
        en: 'The single most important thing: express your rule in canPlace whenever possible. canPlace is checked on every trial placement, so a cheap local test (neighbours, a small marked set…) prunes the search tree dramatically. A valid()-only rule cannot prune: the solver must complete ordinary sudoku solutions first and then reject the bad ones.',
        zh: '最重要的一条：能用 canPlace 表达的规则就尽量用 canPlace。canPlace 在每次试探填数时都会被检查，廉价的局部判断（查邻居、查小集合……）能大幅剪枝。只写 valid 的规则无法剪枝：求解器必须先完成普通数独解，再逐一淘汰不合规的。',
      },
      {
        t: 'ul',
        items: [
          { en: 'Scan as few cells per canPlace call as possible (B.ortho / B.king / B.knight lists, precomputed cells, …).', zh: '每次 canPlace 尽量少扫描格子（用 B.ortho / B.king / B.knight 列表、预先算好的格子集合……）。' },
          { en: 'Precompute fixed geometry once in init() (e.g. the centre 2×2 list) instead of recomputing it per call.', zh: '固定的几何信息在 init() 里算一次（例如中心 2×2 的列表），不要在每次调用时重复计算。' },
          { en: 'For “sum of these cells = K” style rules, prune in canPlace with a running bound (sum so far + v must stay ≤ K); keep the exact equality in valid().', zh: '对“某些格之和 = K”这类规则，用 canPlace 做运行上限剪枝（已有和 + v 不能超过 K），把精确相等留在 valid() 里判定。' },
          { en: 'valid()-only rules on sparse grids can take very long: if the solver has examined complete grids for ~1.5 s without success it stops and reports that the custom rule needs more givens or a canPlace hook.', zh: '稀疏盘面上的纯 valid 规则可能非常慢：若求解器已检查完整盘面约 1.5 秒仍无结果，会停止并提示：该自定义规则需要更多已知数或补充 canPlace 钩子。' },
        ],
      },
    ],
  },
  {
    id: 'debug',
    title: { en: '6 · Debugging & FAQ', zh: '6 · 调试与常见问题' },
    blocks: [
      {
        t: 'ul',
        items: [
          { en: 'My rule does nothing → check the checkbox is ticked, the code compiles (green ✓), and it returns an object. If the code has an error the rule is skipped and a red message shows why.', zh: '规则没生效 → 检查：已勾选启用、代码编译通过（绿色 ✓）、以 return 对象结尾。代码出错时规则会被跳过并在编辑框下方显示红色原因。' },
          { en: 'What is the difference between canPlace and valid? → canPlace rejects a single placement early (fast, used during solving and typing); valid rejects a whole finished grid (final say, cannot prune).', zh: 'canPlace 和 valid 有何区别？→ canPlace 尽早拒绝单次填数（快，求解与输入时调用）；valid 对整张完成的盘面做最终裁决（不能剪枝）。' },
          { en: 'I want to see debug output → console.log works; during solving the logs appear in the browser console (the solver runs in a Worker, still visible in the same console).', zh: '想打印调试信息 → 直接 console.log；求解在 Worker 中运行时，日志同样出现在浏览器控制台。' },
          { en: 'Why did solving stop with the “custom rule …” message? → the rule threw an exception (read the message) or, for valid()-only rules, the 1.5 s budget ran out on a sparse grid.', zh: '为什么求解提示“custom rule …”并停止？→ 规则抛出了异常（看信息内容）；或对纯 valid 规则，稀疏盘面超过了 1.5 秒预算。' },
          { en: 'Does it work with every built-in constraint? → Yes: custom rules add on top of whatever else the puzzle has.', zh: '能与内置约束一起用吗？→ 可以：自定义规则是在谜题其它约束之上叠加的。' },
          { en: 'Rules are included in “Copy link”? → Yes, together with the rest of the puzzle.', zh: '“复制链接”包含规则吗？→ 包含，规则随谜题一起序列化。' },
        ],
      },
    ],
  },
];
