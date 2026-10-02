// Progressive enhancement: native disclosures and links still work without JavaScript.
(() => {
  const header = document.querySelector('.ov-global');
  if (!header) return;
  document.body.classList.add('ov-motion');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  // A short brand introduction once per tab session, never a gate to the content.
  let firstVisit = true;
  try { firstVisit = sessionStorage.getItem('ovrendi_intro_seen') !== '1'; sessionStorage.setItem('ovrendi_intro_seen', '1'); } catch (_) { /* Storage may be disabled. */ }
  if (firstVisit && !reduced.matches) {
    const intro = document.createElement('div');
    intro.className = 'ov-first-visit';
    intro.setAttribute('aria-hidden', 'true');
    intro.innerHTML = '<div class="ov-intro-content"><div class="ov-intro-mark"><img src="/assets/ovrendi-mark.svg" width="72" height="72" alt=""></div><span class="ov-intro-name">Ovrendi<span>.</span></span><span class="ov-intro-tagline">Connected software. Smarter business.</span><span class="ov-intro-track"><span></span></span></div>';
    document.body.append(intro);
    const dismiss = () => {
      intro.remove();
      clearTimeout(timer);
      for (const event of ['pointerdown', 'keydown', 'wheel', 'pagehide']) window.removeEventListener(event, dismiss);
      reduced.removeEventListener('change', dismiss);
    };
    const timer = setTimeout(dismiss, 1500);
    for (const event of ['pointerdown', 'keydown', 'wheel', 'pagehide']) window.addEventListener(event, dismiss, {once: true, passive: true});
    reduced.addEventListener('change', dismiss, {once: true});
  }
  const menus = [...header.querySelectorAll('.ov-menu')];
  const states = new Map();
  const hover = matchMedia('(hover: hover) and (pointer: fine)');
  let hoverOpen, hoverClose;
  const clearHover = () => { clearTimeout(hoverOpen); clearTimeout(hoverClose); };
  const frames = [{opacity: 0, transform: 'translateY(-10px) scale(.985)'}, {opacity: 1, transform: 'translateY(0) scale(1)'}];
  function setOpen(menu, open, immediate = false) {
    const panel = menu.querySelector('.ov-mega-panel');
    const state = states.get(menu);
    state.animation?.cancel();
    state.animation = null;
    state.open = open;
    menu.querySelector('summary').setAttribute('aria-expanded', String(open));
    panel.inert = !open;
    menu.classList.toggle('ov-menu-active', open);
    if (open) menu.open = true;
    if (reduced.matches || immediate || !panel.animate) { menu.open = open; return; }
    const animation = panel.animate(open ? frames : [...frames].reverse(), {
      duration: open ? 240 : 150, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'both'
    });
    state.animation = animation;
    animation.onfinish = () => {
      if (state.animation !== animation) return;
      menu.open = open;
      animation.cancel();
      state.animation = null;
    };
  }
  for (const menu of menus) {
    states.set(menu, {open: menu.open, animation: null});
    const summary = menu.querySelector('summary');
    summary.setAttribute('aria-expanded', String(menu.open));
    menu.addEventListener('pointerenter', event => {
      if (!hover.matches || event.pointerType !== 'mouse') return;
      clearHover();
      hoverOpen = setTimeout(() => {
        for (const other of menus) if (other !== menu) setOpen(other, false, true);
        if (!states.get(menu).open) setOpen(menu, true);
      }, 120);
    });
    menu.addEventListener('pointerleave', event => {
      if (!hover.matches || event.pointerType !== 'mouse') return;
      clearHover();
      hoverClose = setTimeout(() => {
        if (!menu.contains(document.activeElement)) setOpen(menu, false);
      }, 220);
    });
    summary.addEventListener('click', event => {
      clearHover();
      event.preventDefault();
      const open = !states.get(menu).open;
      for (const other of menus) if (other !== menu) setOpen(other, false, true);
      setOpen(menu, open);
    });
    menu.addEventListener('keydown', event => {
      if (event.key === 'Escape' && states.get(menu).open) {
        clearHover();
        setOpen(menu, false); summary.focus(); event.preventDefault();
      }
    });
  }
  for (const type of ['click', 'focusin']) document.addEventListener(type, event => {
    for (const menu of menus) if (states.get(menu).open && !menu.contains(event.target)) setOpen(menu, false);
  });
  const updateHeader = () => header.classList.toggle('ov-scrolled', scrollY > 16);
  addEventListener('scroll', updateHeader, {passive: true});
  updateHeader();

  // Content is visible by default; motion never gates access to the page.
  const entrance = element => {
    if (reduced.matches || !element.animate) return;
    element.animate([{opacity: .35, transform: 'translateY(16px)'}, {opacity: 1, transform: 'translateY(0)'}],
      {duration: 550, easing: 'cubic-bezier(.2,.8,.2,1)'});
  };
  document.querySelectorAll('.ov-hero > div, .ov-division-hero > *, .ov-info-hero > *').forEach(entrance);
  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver(entries => {
      for (const entry of entries) if (entry.isIntersecting) { entrance(entry.target); observer.unobserve(entry.target); }
    }, {threshold: .12});
    document.querySelectorAll('.ov-service, .ov-division-grid article, .fig-frame').forEach(element => observer.observe(element));
  }
  reduced.addEventListener('change', () => {
    if (reduced.matches) {
      document.getAnimations().forEach(animation => animation.cancel());
      for (const menu of menus) setOpen(menu, states.get(menu).open, true);
    }
  });

  // Honest indeterminate feedback while the browser navigates; no artificial delay.
  const loader = document.createElement('div');
  loader.className = 'ov-page-loader';
  loader.setAttribute('role', 'status');
  loader.innerHTML = '<span class="ov-loading-label">Loading page…</span><span class="ov-loading-track" aria-hidden="true"></span>';
  loader.hidden = true;
  document.body.append(loader);
  let timeout;
  const clearLoading = () => { clearTimeout(timeout); loader.hidden = true; };
  document.addEventListener('click', event => {
    const link = event.target.closest('a[href]');
    if (!link || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || link.hasAttribute('download') || (link.target && link.target !== '_self')) return;
    const url = new URL(link.href, location.href);
    if (url.origin !== location.origin || !/^https?:$/.test(url.protocol) || (url.pathname === location.pathname && url.search === location.search)) return;
    loader.hidden = false;
    clearTimeout(timeout);
    timeout = setTimeout(clearLoading, 12000);
  });
  addEventListener('pageshow', clearLoading);
  addEventListener('pagehide', clearLoading);
})();
