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
  setTheme(nextTheme);
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

document.querySelectorAll('pre').forEach((pre) => {
  if (pre.closest('.terminal-window') || pre.closest('.code-window') || pre.classList.contains('ascii-banner')) return;

  const codeWindow = document.createElement('div');
  codeWindow.className = 'code-window';

  const titlebar = document.createElement('div');
  titlebar.className = 'code-titlebar';

  const dots = document.createElement('div');
  dots.className = 'window-dots';
  dots.setAttribute('aria-hidden', 'true');
  dots.innerHTML = '<span></span><span></span><span></span>';
  titlebar.appendChild(dots);

  const body = document.createElement('div');
  body.className = 'code-body';

  const copyButton = document.createElement('button');
  copyButton.className = 'copy-button';
  copyButton.type = 'button';
  copyButton.setAttribute('aria-label', 'Copy command');
  copyButton.innerHTML = '<ion-icon name="copy-outline"></ion-icon>';

  pre.parentNode.insertBefore(codeWindow, pre);
  body.appendChild(pre);
  body.appendChild(copyButton);
  codeWindow.appendChild(titlebar);
  codeWindow.appendChild(body);

  copyButton.addEventListener('click', async () => {
    const commandText = pre.textContent.trim();
    await navigator.clipboard.writeText(commandText);
    copyButton.innerHTML = '<ion-icon name="checkmark-outline"></ion-icon>';
    window.setTimeout(() => {
      copyButton.innerHTML = '<ion-icon name="copy-outline"></ion-icon>';
    }, 1200);
  });
});
