/*
 * constraints/registry.js — plugin registry for constraint modules.
 *
 * Each constraint (renban, palindrome, arrow, …) lives in its own file
 * and self-registers by calling `SudokuConstraints.register({...})`.
 * sudoku-core.js reads that list at puzzle creation, conflict check,
 * and solve time; there is no per-constraint import list anywhere.
 *
 * Every plugin is a plain object with a subset of these hooks:
 *   id             string — unique key, used for logging only
 *   newFields(p)   fill in default puzzle fields on a fresh puzzle
 *   serialize(p)   return the {field: value} chunk to embed in JSON
 *   deserialize(p, j)  hydrate p from the JSON chunk
 *   findConflicts(p, ctx)   scan filled values, add cell indices to
 *                  ctx.conflicts on any violation
 *   solverInit(p, ctx)  precompute lookups; return a handle stored on
 *                  ctx.pluginState[id]. Return null to opt out for this
 *                  puzzle (skips the plugin in the solver hot path).
 *   solverCheck(p, ctx, h, i, v)  return false to reject placing v at i
 *   solverCommit(p, ctx, h, i, v) update handle state after commit
 *   solverUnplace(p, ctx, h, i, v) reverse the commit
 *   solverForbid(p, ctx, h, i, used) return updated `used` bitmask
 *
 * `ctx` inside the solver contains N, regions, grid, bit()/pop() helpers,
 * and any other shared state the core exposes. This lets plugins stay
 * self-contained without duplicating utility math.
 *
 * Loads in both browser and worker contexts (via `self`).
 */
self.SudokuConstraints = self.SudokuConstraints || (function () {
  const plugins = [];
  const byId = Object.create(null);
  return {
    register(p) {
      if (!p || !p.id) throw new Error('constraint plugin missing id');
      if (byId[p.id]) throw new Error('duplicate constraint id: ' + p.id);
      byId[p.id] = p;
      plugins.push(p);
    },
    all()   { return plugins; },
    get(id) { return byId[id] || null; },
  };
})();
