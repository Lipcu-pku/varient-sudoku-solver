/*
 * Sudoku Solver — page glue.
 *
 * Wires up the theme toggle, the language buttons, the localized page
 * chrome, and (re)renders the sudoku UI whenever the locale changes.
 */
(function () {
  document.addEventListener('DOMContentLoaded', init);

  const el = {};
  let unsubs = [];

  function init() {
    el.brand      = document.getElementById('brand');
    el.title      = document.getElementById('page-title');
    el.subtitle   = document.getElementById('page-subtitle');
    el.name       = document.getElementById('sudoku-name');
    el.desc       = document.getElementById('sudoku-description');
    el.container  = document.getElementById('sudoku-container');
    el.themeBtn   = document.querySelector('.theme-btn');
    el.langBtns   = document.querySelectorAll('.lang-btn');

    el.themeBtn.addEventListener('click', () => AppTheme.toggle());
    el.langBtns.forEach(b => {
      b.addEventListener('click', () => AppI18n.setLocale(b.dataset.lang));
    });

    AppTheme.onChange(applyStatic);
    AppI18n.onChange(() => { applyStatic(); renderSudoku(); });

    applyStatic();
    renderSudoku();
  }

  function applyStatic() {
    document.documentElement.lang = AppI18n.locale === 'zh' ? 'zh-Hans' : 'en';
    el.brand.textContent    = AppI18n.ui('brand');
    el.title.textContent    = AppI18n.ui('pageTitle');
    el.subtitle.textContent = AppI18n.ui('pageSubtitle');
    document.title          = AppI18n.ui('pageTitle');
    el.themeBtn.textContent = AppTheme.get() === 'dark'
      ? AppI18n.ui('themeLight')
      : AppI18n.ui('themeDark');
    el.themeBtn.title = el.themeBtn.textContent;
    el.langBtns.forEach(b => b.classList.toggle('active', b.dataset.lang === AppI18n.locale));
    el.name.textContent = L(SudokuApp.name);
    el.desc.textContent = L(SudokuApp.description);
  }

  function renderSudoku() {
    unsubs.forEach(fn => fn()); unsubs = [];
    SudokuApp.render(el.container);
  }
})();
