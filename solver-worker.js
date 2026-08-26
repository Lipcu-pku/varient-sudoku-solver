/*
 * solver-worker.js — background thread for the sudoku solver.
 *
 * Loads sudoku-core.js into a Worker context so a `findSolutions` call can
 * grind on the CPU without blocking the UI. sudoku.js posts one message per
 * solve request (tagged with an incrementing id) and expects one response
 * back. To cancel an in-flight solve, the main thread terminates this
 * worker and spawns a new one — that's the only way to preempt a running
 * JS turn since Workers are single-threaded internally.
 */
importScripts(
  'constraints/registry.js',
  'constraints/renban.js',
  'constraints/palindrome.js',
  'constraints/entropic.js',
  'constraints/parity-line.js',
  'constraints/arrow.js',
  'constraints/quadruple.js',
  'constraints/little-killer.js',
  'constraints/index-cells.js',
  'constraints/hitpoint-arrow.js',
  'sudoku-core.js'
);

self.onmessage = function (e) {
  const { id, puzzle } = e.data;
  const t0 = performance.now();
  try {
    const found = self.SudokuCore.findSolutions(puzzle);
    const dt = (performance.now() - t0) | 0;
    self.postMessage({
      id,
      dt,
      solutions:      found.solutions,
      reachedCap:     !!found.reachedCap,
      invalidRegions: !!found.invalidRegions,
    });
  } catch (err) {
    self.postMessage({ id, error: String(err && err.stack || err) });
  }
};
