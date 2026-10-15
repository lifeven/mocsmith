/** Browser routes. Pure path parsing also drives the static build. */
export const modelPath = (key) => `/models/${encodeURIComponent(key)}/`;
export const mosaicPath = (key) => `/mosaic/${encodeURIComponent(key)}/`;
export const normalizedPath = (path) => path.endsWith('/') ? path : `${path}/`;

export function legacyPath(hash) {
  if (hash === '#/' || hash === '#') return '/';
  if (hash === '#/mine') return '/model/';
  const sample = hash.match(/^#\/s\/([a-z0-9-]+)\/?$/);
  if (sample) return modelPath(sample[1]);
  const mosaic = hash.match(/^#\/mosaic(?:\/([a-z0-9-]+))?\/?$/);
  if (mosaic) return mosaic[1] ? mosaicPath(mosaic[1]) : '/mosaic/';
  if (hash === '#/about' || hash === '#/about/') return '/about/';
  return null;
}

export function parsePath(path) {
  path = normalizedPath(path);
  if (path === '/') return { page: 'start' };
  if (path === '/about/') return { page: 'about' };
  if (path === '/model/') return { page: 'model' };
  if (path === '/mosaic/') return { page: 'mosaic' };
  let match = path.match(/^\/models\/([a-z0-9-]+)\/$/);
  if (match) return { page: 'sample', key: match[1] };
  match = path.match(/^\/mosaic\/([a-z0-9-]+)\/$/);
  if (match) return { page: 'mosaicSample', key: match[1] };
  return null;
}

export function navigate(path, { replace = false } = {}) {
  if (location.pathname !== path || location.hash) {
    history[replace ? 'replaceState' : 'pushState'](null, '', path + location.search);
  }
  dispatchEvent(new Event('appnavigate'));
}

/** Keep normal links, modifier-clicks, external URLs and file downloads native. */
export function setupNavigation() {
  const old = legacyPath(location.hash);
  if (old) history.replaceState(null, '', old + location.search);
  document.addEventListener('click', (event) => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const link = event.target.closest('a[href]');
    if (!link || link.target || link.hasAttribute('download')) return;
    const url = new URL(link.href);
    if (url.origin !== location.origin || url.search || url.hash || !parsePath(url.pathname)) return;
    event.preventDefault();
    navigate(normalizedPath(url.pathname));
  });
  addEventListener('popstate', () => dispatchEvent(new Event('appnavigate')));
  addEventListener('hashchange', () => {
    const path = legacyPath(location.hash);
    if (path) navigate(path, { replace: true });
  });
}
