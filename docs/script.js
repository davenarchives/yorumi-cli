const storageKey = 'yorumi-cli-theme';
const root = document.documentElement;
const themeToggle = document.querySelector('[data-theme-toggle]');

const getPreferredTheme = () => {
  const saved = localStorage.getItem(storageKey);
  if (saved === 'light' || saved === 'dark') return saved;
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
};

const setTheme = (theme) => {
  root.setAttribute('data-theme', theme);
  localStorage.setItem(storageKey, theme);
};

setTheme(getPreferredTheme());

themeToggle?.addEventListener('click', () => {
  const nextTheme = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
  const apply = () => setTheme(nextTheme);

  if (document.startViewTransition) {
    document.startViewTransition(apply);
    return;
  }

  root.classList.add('theme-fade');
  apply();
  window.setTimeout(() => root.classList.remove('theme-fade'), 650);
});

document.querySelectorAll('[data-tabs]').forEach((tabs) => {
  const buttons = Array.from(tabs.querySelectorAll('[data-tab-button]'));
  const panels = Array.from(tabs.querySelectorAll('[data-tab-panel]'));

  buttons.forEach((button) => {
    button.addEventListener('click', () => {
      const target = button.getAttribute('data-tab-button');
      buttons.forEach((item) => item.classList.toggle('active', item === button));
      panels.forEach((panel) => {
        panel.classList.toggle('active', panel.getAttribute('data-tab-panel') === target);
      });
    });
  });
});
