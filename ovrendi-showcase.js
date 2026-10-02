// An illustrative tour of existing ERP screens. No customer data is requested.
(() => {
  const root = document.querySelector('.ov-erp-showcase');
  if (!root) return;
  const slides = [...root.querySelectorAll('.ov-showcase-slide')];
  const buttons = [...root.querySelectorAll('[data-showcase]')];
  const pause = root.querySelector('.ov-showcase-pause');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  let current = 0, timer, animation, progress, paused = reduced.matches, visible = true;
  pause.hidden = reduced.matches;
  const label = () => { pause.hidden = reduced.matches; pause.textContent = paused ? 'Play animation' : 'Pause animation'; };
  function schedule() {
    clearTimeout(timer); progress?.cancel();
    if (paused || reduced.matches || document.hidden || !visible) return;
    progress = buttons[current].querySelector('.ov-tab-progress').animate([{width:'0%'},{width:'100%'}], {duration:6500,fill:'forwards'});
    timer = setTimeout(() => show((current + 1) % slides.length), 6500);
  }
  function show(index) {
    animation?.cancel(); current = index;
    slides.forEach((slide,i) => { slide.hidden = i !== index; });
    buttons.forEach((button,i) => button.setAttribute('aria-pressed', String(i === index)));
    if (!reduced.matches) animation = slides[index].animate([{opacity:.25,transform:'translateY(16px)'},{opacity:1,transform:'translateY(0)'}],{duration:700,easing:'cubic-bezier(.2,.8,.2,1)'});
    schedule();
  }
  buttons.forEach((button,i) => button.addEventListener('click', () => {paused = true; label(); show(i);}));
  pause.addEventListener('click', () => {paused = !paused; label(); schedule();});
  root.addEventListener('focusin', event => {if(event.target !== pause){paused = true; label(); schedule();}});
  reduced.addEventListener('change', () => {paused = reduced.matches; animation?.cancel(); label(); schedule();});
  document.addEventListener('visibilitychange', schedule);
  if ('IntersectionObserver' in window) new IntersectionObserver(entries => {visible = entries[0].isIntersecting; schedule();},{threshold:.1}).observe(root);
  label(); schedule();
})();

