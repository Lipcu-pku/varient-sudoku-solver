/*
 * constraints/count-circle.js
 *
 * Counting circles: cells marked with a circle. If digit v appears in
 * any circled cell, then EXACTLY v circled cells contain the digit v.
 *
 * Corollary: digits with v > totalCircles cannot appear in any circle;
 * a digit v never appears in a circle iff count(v) == 0.
 *
 * State model:
 *   p.countCircles = Int8Array(N*N),  1 = circled
 */
self.SudokuConstraints.register({
  id: 'count-circle',

  newFields(p)      { p.countCircles = new Int8Array(p.N * p.N); },
  serialize(p)      { return { countCircles: [...(p.countCircles || [])] }; },
  deserialize(p, j) {
    const total = p.N * p.N;
    p.countCircles = new Int8Array(total);
    if (j.countCircles && j.countCircles.length === total) p.countCircles.set(j.countCircles);
  },

  findConflicts(p, ctx) {
    const N = p.N, values = p.values;
    const cc = p.countCircles || new Int8Array(N * N);
    /* Count each digit's occurrences within circled cells. */
    const count = new Int32Array(N + 1);
    const cellsByDigit = Array.from({ length: N + 1 }, () => []);
    let totalCircles = 0;
    for (let i = 0; i < N * N; i++) {
      if (!cc[i]) continue;
      totalCircles++;
      const v = values[i]; if (!v) continue;
      count[v]++;
      cellsByDigit[v].push(i);
    }
    for (let v = 1; v <= N; v++) {
      if (count[v] > 0 && count[v] !== v) {
        cellsByDigit[v].forEach(i => ctx.conflicts.add(i));
      }
      if (count[v] > totalCircles) {
        cellsByDigit[v].forEach(i => ctx.conflicts.add(i));
      }
    }
  },

  solverInit(p, ctx) {
    const cc = p.countCircles || new Int8Array(ctx.N * ctx.N);
    let total = 0;
    for (let i = 0; i < cc.length; i++) if (cc[i]) total++;
    if (!total) return null;
    return {
      cc,
      totalCircles: total,
      count: new Int32Array(ctx.N + 1),
      remaining: total,   /* circled cells still empty */
    };
  },

  solverCheck(p, ctx, h, i, v) {
    if (!h.cc[i]) return true;
    const N = ctx.N;
    /* Never allow count[v] to exceed v. */
    if (h.count[v] + 1 > v) return false;
    /* Feasibility: after this placement, every digit d must still be able
       to reach count[d] == d or 0 with the circles that remain. */
    const newCount = h.count[v] + 1;
    const newRemaining = h.remaining - 1;
    /* If newCount < v, we still need (v - newCount) more circles filled
       with v later. Those v's must fit somewhere in the newRemaining slots.
       We can't reserve — but at minimum, need newRemaining >= (v - newCount)
       just for this one digit. That's the loosest bound. */
    if (v - newCount > newRemaining) return false;
    /* Same check for every other partially-satisfied digit. */
    for (let d = 1; d <= N; d++) {
      if (d === v) continue;
      const cd = h.count[d];
      if (cd > 0 && cd < d && (d - cd) > newRemaining) return false;
    }
    return true;
  },

  solverCommit(p, ctx, h, i, v)  {
    if (!h.cc[i]) return;
    h.count[v] += 1;
    h.remaining -= 1;
  },
  solverUnplace(p, ctx, h, i, v) {
    if (!h.cc[i]) return;
    h.count[v] -= 1;
    h.remaining += 1;
  },

  solverForbid(p, ctx, h, i, used) {
    if (!h.cc[i]) return used;
    const N = ctx.N;
    /* Any digit already at count v is fully-satisfied; placing another v
       here would push count over v. */
    for (let v = 1; v <= N; v++) {
      if (h.count[v] >= v) used |= ctx.bit(v);
      /* If placing v here leaves too few remaining circles to complete
         v's own count, it's infeasible. */
      if (v - (h.count[v] + 1) > h.remaining - 1) used |= ctx.bit(v);
    }
    return used;
  },
});
