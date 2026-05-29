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

const links = Array.from(document.querySelectorAll('.sidebar a'));
const sections = links
  .map((link) => document.querySelector(link.getAttribute('href')))
  .filter(Boolean);

const markActive = () => {
  const current = sections
    .filter((section) => section.getBoundingClientRect().top < 140)
    .pop();

  links.forEach((link) => {
    link.classList.toggle('active', current && link.getAttribute('href') === `#${current.id}`);
  });
};

markActive();
document.addEventListener('scroll', markActive, { passive: true });

document.querySelectorAll('pre').forEach((pre) => {
  const wrapper = document.createElement('div');
  wrapper.className = 'code-window';

  const header = document.createElement('div');
  header.className = 'code-header';
  const controls = document.createElement('div');
  controls.className = 'window-controls';
  controls.innerHTML = '<span></span><span></span><span></span>';
  header.appendChild(controls);

  const content = document.createElement('div');
  content.className = 'code-content';

  const copyBtn = document.createElement('button');
  copyBtn.className = 'copy-btn';
  copyBtn.setAttribute('aria-label', 'Copy to clipboard');
  copyBtn.innerHTML = '<svg viewBox="0 0 24 24"><path d="M16 1H4C2.9 1 2 1.9 2 3v14h2V3h12V1zm3 4H8C6.9 5 6 5.9 6 7v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/></svg>';

  copyBtn.addEventListener('click', () => {
    const cmdNodes = Array.from(pre.querySelectorAll('code .cmd'));
    const codeText = cmdNodes.length > 0 
      ? cmdNodes.map(node => node.textContent).join('\n')
      : pre.textContent;
      
    navigator.clipboard.writeText(codeText.trim());
    
    copyBtn.innerHTML = '<svg viewBox="0 0 24 24"><path d="M9 16.2L4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4L9 16.2z"/></svg>';
    setTimeout(() => {
      copyBtn.innerHTML = '<svg viewBox="0 0 24 24"><path d="M16 1H4C2.9 1 2 1.9 2 3v14h2V3h12V1zm3 4H8C6.9 5 6 5.9 6 7v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/></svg>';
    }, 2000);
  });

  pre.parentNode.insertBefore(wrapper, pre);
  content.appendChild(pre);
  content.appendChild(copyBtn);
  wrapper.appendChild(header);
  wrapper.appendChild(content);
});
