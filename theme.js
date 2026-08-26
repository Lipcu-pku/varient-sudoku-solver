/*
 * Standalone theme + i18n for the Sudoku Solver site.
 * Uses its own localStorage keys so it never fights with any other site
 * you happen to host on the same origin.
 */

/* ---------------- AppTheme ---------------- */
window.AppTheme = (function () {
  const KEY = 'sudoku-solver-theme';
  const listeners = new Set();
  let theme = 'dark';
  try {
    const saved = localStorage.getItem(KEY);
    if (saved === 'light' || saved === 'dark') theme = saved;
    else if (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches) theme = 'light';
  } catch (e) { /* localStorage may be unavailable in file:// mode */ }
  function apply() {
    document.documentElement.setAttribute('data-theme', theme);
  }
  return {
    get() { return theme; },
    set(next) {
      if (next !== 'light' && next !== 'dark') return;
      if (next === theme) return;
      theme = next;
      try { localStorage.setItem(KEY, theme); } catch (e) {}
      apply();
      listeners.forEach(fn => fn(theme));
    },
    toggle() { this.set(theme === 'dark' ? 'light' : 'dark'); },
    onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    apply,
  };
})();
AppTheme.apply();

/* ---------------- AppI18n ---------------- */
window.AppI18n = (function () {
  const KEY = 'sudoku-solver-locale';
  const listeners = new Set();
  let locale = 'en';
  try {
    const saved = localStorage.getItem(KEY);
    if (saved === 'en' || saved === 'zh') locale = saved;
  } catch (e) {}

  const UI = {
    brand:        { en: 'Sudoku Solver',                                 zh: '数独求解器' },
    pageTitle:    { en: 'Sudoku Solver',                                 zh: '数独求解器' },
    pageSubtitle: {
      en: 'Any A×B grid — classic, jigsaw, Spectradoku, killer, thermo, skyscraper, sandwich, whisper / region-sum / modular lines, Kropki, X, anti-knight/king',
      zh: '任意 A×B 网格 — 经典、异形宫、光谱数独、杀手框、温度计、摩天楼、三明治、德国耳语线/区域和线/模 3 线、黑白点、对角、反马步/反王步',
    },
    themeLight:   { en: 'Light', zh: '浅色' },
    themeDark:    { en: 'Dark',  zh: '深色' },
  };

  return {
    get locale() { return locale; },
    setLocale(next) {
      if (next !== 'en' && next !== 'zh') return;
      if (next === locale) return;
      locale = next;
      try { localStorage.setItem(KEY, locale); } catch (e) {}
      document.documentElement.lang = locale === 'zh' ? 'zh-Hans' : 'en';
      listeners.forEach(fn => fn(locale));
    },
    onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    ui(key) { const v = UI[key]; return (v && v[locale]) || (v && v.en) || key; },
    resolve(value) {
      if (value == null) return '';
      if (typeof value === 'string') return value;
      if (typeof value === 'object') return value[locale] ?? value.en ?? Object.values(value)[0] ?? '';
      return String(value);
    },
  };
})();

/* Global resolver used inline by sudoku.js. */
window.L = function (v) { return AppI18n.resolve(v); };
