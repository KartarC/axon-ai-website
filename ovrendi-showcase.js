// Rotating product-screen gallery; all figures use illustrative demo data.
(() => {
  const root = document.querySelector('.ov-fan-gallery');
  if (!root) return;
  const slides = [...root.querySelectorAll('.ov-showcase-slide')];
  const buttons = [...root.querySelectorAll('[data-showcase]')];
  const pause = root.querySelector('.ov-showcase-pause');
  const caption = root.querySelector('.ov-fan-caption');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  let current = 0, timer, progress, paused = reduced.matches, visible = true;
  function label() {
    pause.hidden = reduced.matches;
    pause.textContent = paused ? 'Play animation' : 'Pause animation';
  }
  function schedule() {
    clearTimeout(timer); progress?.cancel();
    if (paused || reduced.matches || document.hidden || !visible) return;
    progress = buttons[current].querySelector('.ov-tab-progress').animate([{width:'0%'},{width:'100%'}], {duration:5000,fill:'forwards'});
    timer = setTimeout(() => show((current + 1) % slides.length), 5000);
  }
  function show(index) {
    current = index;
    slides.forEach((slide,i) => {
      const offset = (i - index + slides.length) % slides.length;
      slide.dataset.position = ['front','right','left'][offset];
      slide.setAttribute('aria-hidden', String(i !== index));
    });
    buttons.forEach((button,i) => button.setAttribute('aria-pressed', String(i === index)));
    caption.querySelector('strong').textContent = slides[index].querySelector('figcaption strong').textContent;
    caption.querySelector('p').textContent = slides[index].querySelector('figcaption p').textContent;
    schedule();
  }
  buttons.forEach((button,i) => button.addEventListener('click', () => {paused = true; label(); show(i);}));
  pause.addEventListener('click', () => {paused = !paused; label(); schedule();});
  root.addEventListener('focusin', event => {if(event.target !== pause){paused = true; label(); schedule();}});
  reduced.addEventListener('change', () => {paused = reduced.matches; label(); schedule();});
  document.addEventListener('visibilitychange', schedule);
  if ('IntersectionObserver' in window) new IntersectionObserver(entries => {visible = entries[0].isIntersecting; schedule();},{threshold:.1}).observe(root);
  label(); schedule();
})();
