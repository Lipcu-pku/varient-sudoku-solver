/*
 * constraints/extra-region.js
 *
 * Extra region: an arbitrary user-picked set of cells in which no digit
 * may repeat. Unlike Killer cages, there's no sum — this is a pure
 * uniqueness group. Any number of extra regions may exist, and each
 * region is drawn with its own tint so overlapping / interleaving
 * regions stay readable.
 *
 * State model:
 *   p.extraRegions = [ { cells:[idx, ...] }, ... ]
 */
self.SudokuConstraints.register({
  id: 'extra-region',

  newFields(p)      { p.extraRegions = []; },
  serialize(p)      { return { extraRegions: p.extraRegions || [] }; },
  deserialize(p, j) {
    p.extraRegions = (j.extraRegions || []).map(er => ({
      cells: [...(er.cells || [])],
    }));
  },

  findConflicts(p, ctx) {
    const N = p.N, values = p.values;
    for (const er of (p.extraRegions || [])) {
      /* A no-repeat region can hold at most N distinct digits — anything
         larger is unsatisfiable, so flag every cell in it. */
      if (er.cells.length > N) {
        for (const i of er.cells) ctx.conflicts.add(i);
        continue;
      }
      const seen = new Map();
      for (const i of er.cells) {
        const v = values[i]; if (!v) continue;
        if (seen.has(v)) { ctx.conflicts.add(seen.get(v)); ctx.conflicts.add(i); }
        else seen.set(v, i);
      }
    }
  },

  solverInit(p, ctx) {
    const list = p.extraRegions || [];
    if (!list.length) return null;
    const N = ctx.N;
    const lookup = Array.from({ length: ctx.total != null ? ctx.total : N * N }, () => []);
    const mask = new Int32Array(list.length);
    list.forEach((er, ri) => {
      /* An oversized region is impossible — pre-fill its mask with every
         digit so solverCheck rejects every placement in it and the search
         returns zero solutions. */
      if (er.cells.length > N) mask[ri] = ctx.full;
      for (const i of er.cells) lookup[i].push(ri);
    });
    return { list, lookup, mask };
  },

  solverCheck(p, ctx, h, i, v) {
    const mb = ctx.bit(v);
    for (const ri of h.lookup[i]) if (h.mask[ri] & mb) return false;
    return true;
  },
  solverCommit(p, ctx, h, i, v)   { const mb = ctx.bit(v); for (const ri of h.lookup[i]) h.mask[ri] |= mb; },
  solverUnplace(p, ctx, h, i, v)  { const mb = ctx.bit(v); for (const ri of h.lookup[i]) h.mask[ri] &= ~mb; },
  solverForbid(p, ctx, h, i, used){ for (const ri of h.lookup[i]) used |= h.mask[ri]; return used; },
});
