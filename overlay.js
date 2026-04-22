'use strict';

const container = document.getElementById('crack-container');

window.openwhipmax.onFlash(() => {
  container.classList.remove('visible');
  void container.offsetWidth; // force reflow to restart animation
  container.classList.add('visible');

  container.addEventListener('animationend', () => {
    container.classList.remove('visible');
    window.openwhipmax.overlayDone();
  }, { once: true });
});
