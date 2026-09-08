/*
 * custom-rule-examples.js — ready-made templates for the "Custom
 * Constraints" tool (loaded in the browser only, not in the solver worker).
 *
 * Each example's `code` is the body of a function that must `return` a rule
 * descriptor; the same strings appear verbatim in the docs. `name` is the
 * rule name a freshly inserted rule starts with; `blurb` is a one-liner.
 * Keep this file in sync with custom-rule-docs.js only where convenient —
 * the docs render these entries directly, so example code lives here once.
 */
window.CustomRuleExamples = [
  {
    key: 'antiKnight',
    name: { en: 'Anti-Knight', zh: '反马步' },
    blurb: {
      en: 'No two cells a knight-move apart may hold the same digit. Pure canPlace rule — fast, prunes the search hard.',
      zh: '马步距离内的两格数字不能相同。纯 canPlace 规则 — 速度快、剪枝强。',
    },
    code: [
      '// 反马步 Anti-Knight：马步距离内的两格数字不能相同',
      'return {',
      "  name: 'Anti-Knight',",
      '  canPlace(i, v, B) {',
      '    // 附近已存在数字 v 时拒绝（i 此刻在 B 中为空）',
      '    for (const j of B.knight(i)) {',
      '      if (B.values[j] === v) return false;',
      '    }',
      '    return true;',
      '  },',
      '};',
    ].join('\n'),
  },
  {
    key: 'nonConsecutive',
    name: { en: 'Non-Consecutive', zh: '反邻数' },
    blurb: {
      en: 'Orthogonally adjacent digits may never be consecutive (differ by exactly 1).',
      zh: '正交相邻的两格数字差不能为 1（不能是连续数）。',
    },
    code: [
      '// 反邻数 Non-Consecutive：正交相邻两格不能相差 1',
      'return {',
      "  name: 'Non-Consecutive',",
      '  canPlace(i, v, B) {',
      '    for (const j of B.ortho(i)) {',
      '      const w = B.values[j];',
      '      if (w !== 0 && Math.abs(w - v) === 1) return false;',
      '    }',
      '    return true;',
      '  },',
      '};',
    ].join('\n'),
  },
  {
    key: 'hardWhisper',
    name: { en: 'Whisper (diff ≥ 4)', zh: '强耳语（差 ≥ 4）' },
    blurb: {
      en: 'Any two cells sharing an edge or a corner must differ by at least 4 (B.king = all 8 neighbours).',
      zh: '任意相邻（含斜角，八方向）两格之差至少为 4。',
    },
    code: [
      '// 强耳语 Whisper：所有八方向相邻格之差 ≥ 4',
      'return {',
      "  name: 'Whisper (diff ≥ 4)',",
      '  canPlace(i, v, B) {',
      '    for (const j of B.king(i)) {',
      '      const w = B.values[j];',
      '      if (w !== 0 && Math.abs(w - v) < 4) return false;',
      '    }',
      '    return true;',
      '  },',
      '};',
    ].join('\n'),
  },
  {
    key: 'mirror',
    name: { en: 'Mirror Equality', zh: '中心镜像等值' },
    blurb: {
      en: 'Cells that coincide after rotating the grid 180° must hold equal digits (a common hand-made rule).',
      zh: '绕盘面中心旋转 180° 后重合的两格必须同数（手工题常见的镜像规则）。',
    },
    code: [
      '// 中心镜像 Mirror：180° 旋转对称的两格数字相同',
      'return {',
      "  name: 'Mirror Equality',",
      '  canPlace(i, v, B) {',
      '    const r = B.row(i), c = B.col(i);',
      '    const rr = B.rows - 1 - r;',
      '    const cc = B.cols - 1 - c;',
      '    if (rr === r && cc === c) return true;   // 正中心一格无镜像',
      '    const w = B.values[B.idx(rr, cc)];       // 镜像格的当前值',
      '    return w === 0 || w === v;',
      '  },',
      '};',
    ].join('\n'),
  },
  {
    key: 'centerSum',
    name: { en: 'Center Sum 22', zh: '中心四格和 22' },
    blurb: {
      en: 'The central 2×2 block sums to 22. Shows the recommended combo: canPlace keeps partial sums within budget, valid() pins the exact total.',
      zh: '中心 2×2 四格之和为 22。演示推荐组合：canPlace 做“不超过上限”的剪枝，valid 保证整盘恰好等于目标。',
    },
    code: [
      '// 中心四格和 = 22（9×9 示例，其它尺寸请改 TARGET）',
      'const TARGET = 22;',
      'let cells = [];                 // init 时按网格尺寸计算中心 2×2',
      'return {',
      "  name: 'Center Sum 22',",
      '  init(B) {',
      '    const r0 = Math.floor((B.rows - 2) / 2);',
      '    const c0 = Math.floor((B.cols - 2) / 2);',
      '    cells = [B.idx(r0, c0), B.idx(r0, c0 + 1), B.idx(r0 + 1, c0), B.idx(r0 + 1, c0 + 1)];',
      '  },',
      '  canPlace(i, v, B) {           // 剪枝：部分和不能超过目标',
      '    if (!cells.includes(i)) return true;',
      '    let s = v;',
      '    for (const j of cells) {',
      '      if (j !== i) s += B.values[j];',
      '    }',
      '    return s <= TARGET;',
      '  },',
      '  valid(B) {                    // 整盘完成：必须恰好等于目标',
      '    let s = 0;',
      '    for (const j of cells) s += B.values[j];',
      '    return s === TARGET;',
      '  },',
      '};',
    ].join('\n'),
  },
  {
    key: 'evenCorners',
    name: { en: 'Even Corners', zh: '四角为偶数' },
    blurb: {
      en: 'All four corner cells must be even. Demonstrates a valid()-only rule: it is checked when the grid is complete, so give the puzzle enough clues (see docs §Performance).',
      zh: '四个角格必须都是偶数。演示只写 valid 的规则：整盘填满时才校验，谜题线索要足够（见文档“性能”一节）。',
    },
    code: [
      '// 四角为偶数 Even Corners（只用 valid 的示例）',
      'return {',
      "  name: 'Even Corners',",
      '  valid(B) {',
      '    const corners = [',
      '      B.idx(0, 0),',
      '      B.idx(0, B.cols - 1),',
      '      B.idx(B.rows - 1, 0),',
      '      B.idx(B.rows - 1, B.cols - 1),',
      '    ];',
      '    return corners.every(i => B.values[i] % 2 === 0);',
      '  },',
      '};',
    ].join('\n'),
  },
];
