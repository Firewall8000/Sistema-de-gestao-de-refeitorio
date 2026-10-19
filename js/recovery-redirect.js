// Dashboard recovery emails may return to Site URL (the app's root).
// Move them before loading analytics or the main application's auth client.
(() => {
  const hash = new URLSearchParams(window.location.hash.slice(1));
  if (hash.get('type') !== 'recovery' && !hash.has('error_code')) return;
  const destination = new URL('recuperar-senha.html', window.location.href);
  destination.hash = window.location.hash;
  window.history.replaceState(null, '', window.location.pathname);
  window.location.replace(destination.href);
})();
