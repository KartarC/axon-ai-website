// Native scrolling stays in control. All content is visible without JavaScript.
(() => {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const canvas = document.querySelector('.oe-screen-canvas');
  const animations = new Set();
  let frame = 0;
  function draw() {
    frame = 0;
    if (!canvas || reduced.matches) return;
    const rect = canvas.getBoundingClientRect();
    if (rect.bottom < 0 || rect.top > innerHeight) return;
    const amount = Math.max(-1, Math.min(1, (innerHeight / 2 - rect.top - rect.height / 2) / innerHeight));
    canvas.style.setProperty('--oe-shift', `${amount * 65}px`);
    canvas.style.setProperty('--oe-turn', `${amount * 100}deg`);
  }
  const requestDraw = () => { if (!frame && !reduced.matches) frame = requestAnimationFrame(draw); };
  if (canvas) {
    addEventListener('scroll', requestDraw, {passive:true});
    addEventListener('resize', requestDraw, {passive:true});
    requestDraw();
  }
  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver(entries => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        observer.unobserve(entry.target);
        if (reduced.matches || !entry.target.animate) continue;
        const animation = entry.target.animate([
          {opacity:.3,transform:'translateY(32px)'},
          {opacity:1,transform:'translateY(0)'}
        ], {duration:800,easing:'cubic-bezier(.16,1,.3,1)'});
        animations.add(animation);
        animation.finished.then(() => animations.delete(animation), () => animations.delete(animation));
      }
    }, {threshold:.08});
    document.querySelectorAll('.oe-hero-heading, .oe-intro-copy, .oe-section-heading, .oe-division-row, .ov-article-card, .plan').forEach(el => observer.observe(el));
  }
  reduced.addEventListener('change', () => {
    if (reduced.matches) {
      cancelAnimationFrame(frame); frame = 0;
      animations.forEach(animation => animation.cancel());
      canvas?.style.removeProperty('--oe-shift');
      canvas?.style.removeProperty('--oe-turn');
    } else requestDraw();
  });
})();
