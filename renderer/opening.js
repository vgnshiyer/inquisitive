// The opening (opening.css): the name rises into place, its asterisk lands, and the window
// is uncovered. It plays once, when the window loads.

(() => {
  const opening = document.getElementById('opening');
  if (!opening) return;
  const close = () => opening.remove();
  // A test run goes without it (main.js says so), and so does anyone who has asked their Mac
  // for less motion.
  if (new URLSearchParams(location.search).has('quiet') || matchMedia('(prefers-reduced-motion: reduce)').matches) return close();

  const EASE = 'cubic-bezier(0.16, 1, 0.3, 1)';
  const word = opening.querySelector('.word');
  const mark = opening.querySelector('.mark');
  // Whatever happens (a window that is never shown draws no frames), the window is uncovered.
  const giveUp = setTimeout(close, 5000);

  const face = document.fonts.load("400 64px 'Fraunces Logo'");
  const patience = new Promise((resolve) => setTimeout(resolve, 1500));
  Promise.race([face, patience]).then(async () => {
    opening.classList.add('on');
    word.animate([{ opacity: 0, transform: 'translateY(16px)' }, { opacity: 1, transform: 'none' }], { duration: 1100, easing: EASE, fill: 'both' });
    // A fifth of a turn: the asterisk has five arms, so it lands looking as it started.
    const landing = mark.animate([{ opacity: 0, transform: 'scale(0) rotate(-72deg)' }, { opacity: 1, transform: 'none' }], { duration: 800, delay: 650, easing: EASE, fill: 'both' });
    await landing.finished;
    await opening.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 400, delay: 400, easing: 'ease', fill: 'forwards' }).finished;
    clearTimeout(giveUp);
    close();
  }, close);
})();
