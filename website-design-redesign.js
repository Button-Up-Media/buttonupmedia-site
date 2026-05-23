(function () {
  const hero = document.querySelector('.rw-parallax-hero');
  if (!hero) return;

  const layers = Array.from(hero.querySelectorAll('[data-depth]'));
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const isMobileLayout = window.matchMedia('(max-width: 760px)').matches || window.matchMedia('(pointer: coarse)').matches;

  function setTransforms(x, y) {
    for (const el of layers) {
      const depth = parseFloat(el.getAttribute('data-depth') || '1');
      const tx = x * -16 * depth;
      const ty = y * -12 * depth;
      const rotX = y * 4;
      const rotY = x * -6;
      const settle = el.classList.contains('rw-parallax-laptop') ? 3 : 0;
      el.style.transform =
        `translate3d(${tx}px, ${ty}px, 0) rotateX(${rotX + settle}deg) rotateY(${rotY}deg)`;
    }
  }

  if (prefersReducedMotion || isMobileLayout) {
    setTransforms(0, 0);
    return;
  }

  let raf = 0;
  let targetX = 0;
  let targetY = 0;

  function tick() {
    raf = 0;
    setTransforms(targetX, targetY);
  }

  function schedule() {
    if (raf) return;
    raf = window.requestAnimationFrame(tick);
  }

  hero.addEventListener('mousemove', (event) => {
    const rect = hero.getBoundingClientRect();
    const px = (event.clientX - rect.left) / rect.width;
    const py = (event.clientY - rect.top) / rect.height;
    targetX = Math.max(-1, Math.min(1, (px - 0.5) * 2));
    targetY = Math.max(-1, Math.min(1, (py - 0.5) * 2));
    schedule();
  });

  hero.addEventListener('mouseleave', () => {
    targetX = 0;
    targetY = 0;
    schedule();
  });

  setTransforms(0, 0);
})();
