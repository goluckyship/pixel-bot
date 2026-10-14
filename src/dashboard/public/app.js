// Makes the Pixel Bot website installable as an app (Chrome, Edge, Android, iPhone "Add to Home Screen").
(() => {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {});
  }
  const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  if (standalone) document.documentElement.classList.add('installed');
  let deferred = null;
  const buttons = () => document.querySelectorAll('[data-install]');
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferred = event;
    buttons().forEach((b) => { b.hidden = false; });
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    buttons().forEach((b) => { b.hidden = true; });
  });
  document.addEventListener('click', async (event) => {
    const button = event.target.closest('[data-install]');
    if (!button) return;
    event.preventDefault();
    if (deferred) {
      deferred.prompt();
      await deferred.userChoice.catch(() => {});
      deferred = null;
      buttons().forEach((b) => { b.hidden = true; });
    } else {
      location.href = '/install';
    }
  });
})();
