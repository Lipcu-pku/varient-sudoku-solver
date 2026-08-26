/*
 * constraints/arrow.js
 *
 * Arrows: the digits along the shaft sum to the multi-digit number spelled
 * out on the base pill (base[0] is the most significant digit). The state
 * maintained per arrow:
 *   baseVal,   baseFilled   — running numeric value + count on the base
 *   pathSum,   pathFilled   — running sum + count on the shaft
 * Placement checks a fully-known target against a growing shaft sum and
 * rejects overshoots or mismatches once everything is filled.
 */
self.SudokuConstraints.register({
  id: 'arrow',

  newFields(p)      { p.arrows = []; },
  serialize(p)      { return { arrows: p.arrows || [] }; },
  deserialize(p, j) {
    p.arrows = (j.arrows || []).map(a => ({
      base: [...(a.base || [])],
      path: [...(a.path || [])],
    }));
  },

  findConflicts(p, ctx) {
    const values = p.values;
    for (const arrow of (p.arrows || [])) {
      const base = arrow.base || [], path = arrow.path || [];
      if (!base.length || !path.length) continue;
      if (!base.every(i => values[i]) || !path.every(i => values[i])) continue;
      let target = 0;
      for (const i of base) target = target * 10 + values[i];
      let sum = 0;
      for (const i of path) sum += values[i];
      if (sum !== target) {
        base.forEach(i => ctx.conflicts.add(i));
        path.forEach(i => ctx.conflicts.add(i));
      }
    }
  },

  solverInit(p, ctx) {
    const arrows = p.arrows || [];
    if (!arrows.length) return null;
    const N = ctx.N;
    const total = N * N;
    const baseOf = Array.from({ length: total }, () => []);
    const pathOf = Array.from({ length: total }, () => []);
    arrows.forEach((a, ai) => {
      (a.base || []).forEach((cell, pos) => baseOf[cell].push({ ai, pos }));
      (a.path || []).forEach(cell => pathOf[cell].push({ ai }));
    });
    return {
      arrows,
      baseOf,
      pathOf,
      baseVal:    new Int32Array(arrows.length),
      baseFilled: new Int32Array(arrows.length),
      pathSum:    new Int32Array(arrows.length),
      pathFilled: new Int32Array(arrows.length),
    };
  },

  solverCheck(p, ctx, h, i, v) {
    for (const { ai } of h.pathOf[i]) {
      const arrow = h.arrows[ai];
      const baseDone = h.baseFilled[ai] === arrow.base.length;
      if (!baseDone) continue;
      const target = h.baseVal[ai];
      const newSum = h.pathSum[ai] + v;
      const newFill = h.pathFilled[ai] + 1;
      if (newFill === arrow.path.length) {
        if (newSum !== target) return false;
      } else if (newSum > target) {
        return false;
      }
    }
    for (const { ai, pos } of h.baseOf[i]) {
      const arrow = h.arrows[ai];
      const digitPlace = arrow.base.length - 1 - pos;
      const newBaseVal = h.baseVal[ai] + v * Math.pow(10, digitPlace);
      const newBaseFill = h.baseFilled[ai] + 1;
      if (newBaseFill === arrow.base.length) {
        const pathDone = h.pathFilled[ai] === arrow.path.length;
        if (pathDone && h.pathSum[ai] !== newBaseVal) return false;
        if (h.pathSum[ai] > newBaseVal) return false;
      }
    }
    return true;
  },

  solverCommit(p, ctx, h, i, v) {
    for (const { ai } of h.pathOf[i]) {
      h.pathSum[ai] += v;
      h.pathFilled[ai] += 1;
    }
    for (const { ai, pos } of h.baseOf[i]) {
      const digitPlace = h.arrows[ai].base.length - 1 - pos;
      h.baseVal[ai] += v * Math.pow(10, digitPlace);
      h.baseFilled[ai] += 1;
    }
  },

  solverUnplace(p, ctx, h, i, v) {
    for (const { ai } of h.pathOf[i]) {
      h.pathSum[ai] -= v;
      h.pathFilled[ai] -= 1;
    }
    for (const { ai, pos } of h.baseOf[i]) {
      const digitPlace = h.arrows[ai].base.length - 1 - pos;
      h.baseVal[ai] -= v * Math.pow(10, digitPlace);
      h.baseFilled[ai] -= 1;
    }
  },

  solverForbid(p, ctx, h, i, used) {
    const N = ctx.N;
    for (const { ai } of h.pathOf[i]) {
      const arrow = h.arrows[ai];
      if (h.baseFilled[ai] !== arrow.base.length) continue;
      const remaining = h.baseVal[ai] - h.pathSum[ai];
      /* Any v > remaining overshoots the known target. */
      for (let v = 1; v <= N; v++) if (v > remaining) used |= ctx.bit(v);
    }
    return used;
  },
});
