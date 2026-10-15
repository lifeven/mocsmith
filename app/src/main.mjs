import { parsePath, modelPath, mosaicPath, navigate, setupNavigation } from './ui/navigation.mjs';
import { createBuilder } from './runtime/client.mjs';
import { mountPages } from './ui/pages.mjs';
import { SAMPLES } from './data/samples.mjs';
import { MOSAIC_SAMPLES } from './data/mosaic-samples.mjs';
import { setupStart, startStatus, mosaicStatus } from './ui/start/index.mjs';
import { setupI18n, t, locale } from './i18n/index.mjs';
import { aboutHtml } from './ui/about.mjs';
import { readPhoto } from './ui/mosaic/photo.mjs';

/**
 * Assemble the start, model, mosaic and About pages using clean URL paths.
 * Local files remain in memory; built-in samples have shareable routes.
 * Conversion, viewing and mosaic modules load on demand. Query options
 * configure worker execution, surface finishing and local diagnostics.
 * `?shot` shows only the model for preview generation. `?debug` exposes the
 * current stage and model for development checks and enables URL input.
 */
const params = new URLSearchParams(location.search);
if (params.has('sample') && SAMPLES[params.get('sample')]) {
  const key = params.get('sample');
  params.delete('sample');
  history.replaceState(null, '', modelPath(key) + (params.size ? `?${params}` : ''));
}
if (params.has('shot')) document.body.classList.add('shot');
mountPages();
setupI18n(document.getElementById('lang-switch'));

/** The result page once loaded (builds only start from it, so their answers find it there). */
let page = null;
const builder = createBuilder(
  (model, info) => {
    page.onBuilt(model, info);
    if (debug) debug.model = model;
  },
  (message) => page.onError(message),
  { useWorker: params.get('worker') !== '0' },
);
const settings = {
  // Developer overrides: ?slopeTol=0 limits slopes to
  // one-plate ledges. ?inverted=0 and ?round=0 disable those surface parts.
  // ?palette=20 restricts voxel colours to the stable base palette.
  ...(params.has('slopeTol') && { slopeTolerance: params.get('slopeTol') !== '0' }),
  ...((params.has('inverted') || params.has('round')) && {
    parts: Object.fromEntries(['inverted', 'round'].filter((k) => params.has(k)).map((k) => [k, params.get(k) !== '0'])),
  }),
  ...(params.has('palette') && { paletteSize: Number(params.get('palette')) }),
  // ?shades=0 maps each cell independently; STEP[,SPAN] configures paint patches.
  ...(params.has('shades') && { shadeStep: Number(params.get('shades').split(',')[0]), ...(params.get('shades').includes(',') && { shadeSpan: Number(params.get('shades').split(',')[1]) }) }),
  // ?colours=8 starts with that colour cap, ?colours=0 with none.
  ...(params.has('colours') && { maxColours: Number(params.get('colours')) || null }),
  // ?thicken=1 widens thin details; layer, column and post select the rule.
  ...(params.has('thicken') && { thicken: params.get('thicken') !== '0', ...(['layer', 'column', 'post'].includes(params.get('thicken')) && { thickenRule: params.get('thicken') }) }),
};
/** ?debug exposes the stage and last model on window.app, for scripted screenshots and checks. */
const debug = params.has('debug') ? (window.app = { stage: null, bricks: null, model: null, mosaic: null, mosaicMs: 0 }) : null;

/** The 3D viewer and result page, loaded once on first use. */
let viewer = null;
function loadViewer() {
  viewer ??= import('./ui/result/viewer.mjs').then(({ createViewer }) => {
    const v = createViewer({ builder, settings });
    page = v.page;
    if (debug) Object.assign(debug, { stage: v.stage, bricks: v.bricks });
    return v;
  });
  return viewer;
}
/** Reading models (three.js's glTF loader), loaded once on first use. */
let sourcesModule = null;
const sources = () => (sourcesModule ??= import('./ui/sources.mjs'));

/** The mosaic page (and the 2.5D depth model's client), loaded once on the first visit to /mosaic/. */
let mosaicModule = null;
const mosaicPage = () =>
  (mosaicModule ??= Promise.all([import('./ui/mosaic/index.mjs'), import('./runtime/depth.mjs')]).then(([{ createMosaicPage }, { createDepthEstimator }]) =>
    createMosaicPage({
      createDepthEstimator,
      onBuilt(mosaic, ms) {
        if (debug) Object.assign(debug, { mosaic, mosaicMs: ms });
      },
    }),
  ));
/** The photo for the mosaic page, once chosen (read by readPhoto). */
let photo = null;

/** The visitor's own file, once opened. */
let mine = null;

setupStart({
  onFile(file) {
    startStatus(t('start.reading', { name: file.name }));
    sources()
      .then((m) => m.sourceFromFile(file))
      .then(openMine)
      .catch((err) => startStatus(err.message));
  },
  onPicture(file) {
    sources()
      .then((m) => m.sourceFromPicture(file, startStatus))
      .then(openMine)
      .catch((err) => startStatus(err.message));
  },
  onMosaic(file) {
    mosaicStatus(t('start.mosaic.reading', { name: file.name }));
    readPhoto(file)
      .then(({ canvas, pixels }) => {
        photo = { name: file.name.replace(/\.\w+$/, ''), canvas, pixels };
        mosaicStatus('');
        navigate('/mosaic/');
      })
      .catch((err) => mosaicStatus(t('start.mosaic.failed', { message: err.message ?? err })));
  },
});

function openMine(source) {
  mine = source;
  startStatus('');
  navigate('/model/');
}

/** An example photo for the mosaic (data/mosaic-samples.mjs), read once and kept. Declared before the
 * first route(), which can open one straight away (/mosaic/<example>/ on load). */
const examplePhotos = new Map();

setupNavigation();
addEventListener('appnavigate', route);
route();

function route() {
  const current = parsePath(location.pathname);
  updateCanonical();
  if (current?.page === 'sample' && SAMPLES[current.key]) return openSample(current.key);
  if (current?.page === 'model' && mine) return showResult(mine);
  if (current?.page === 'mosaic' && photo) return showMosaic();
  if (current?.page === 'mosaicSample' && MOSAIC_SAMPLES[current.key]) return openMosaicSample(current.key);
  if (current?.page === 'about') return showAbout();
  if (debug && location.hash.startsWith('#/url/')) return openUrl(decodeURIComponent(location.hash.slice('#/url/'.length)));
  showStart();
}

function updateCanonical() {
  const url = `https://mocsmith.lifeven.com${location.pathname}`;
  document.querySelector('link[rel="canonical"]')?.setAttribute('href', url);
  document.querySelector('meta[property="og:url"]')?.setAttribute('content', url);
}

/** Show one page section, hide the others; the back link is shown away from the start page. */
function showPage(id) {
  for (const s of ['start', 'result', 'mosaic', 'about']) document.getElementById(s).hidden = s !== id;
  document.getElementById('back').hidden = id === 'start';
  const about = document.getElementById('about-link');
  if (id === 'about') about.setAttribute('aria-current', 'page');
  else about.removeAttribute('aria-current');
}

function showStart() {
  showPage('start');
  document.title = t('page.title');
  // Local-file routes have no file after a fresh load. Keep the URL and show the upload entry.
}

/** About page: credits, licences, privacy; redrawn when the language changes. */
function showAbout() {
  showPage('about');
  document.getElementById('about-body').innerHTML = aboutHtml(locale());
  document.title = t('about.title');
}
document.addEventListener('localechange', () => {
  if (!document.getElementById('about').hidden) showAbout();
});

function showMosaic() {
  showPage('mosaic');
  const shown = photo;
  mosaicPage().then(
    (page) => {
      // Moved on while the page was loading: show it when it is visited again.
      if (!document.getElementById('mosaic').hidden && photo === shown) page.show(shown);
    },
    (err) => {
      showStart();
      mosaicStatus(t('start.mosaic.failed', { message: err.message ?? err }));
    },
  );
}

function openMosaicSample(key) {
  const shown = examplePhotos.get(key);
  if (shown) {
    photo = shown;
    return showMosaic();
  }
  const name = t(`mosaicSample.${key}.label`);
  mosaicStatus(t('start.mosaic.reading', { name }));
  fetch(MOSAIC_SAMPLES[key].url)
    .then((r) => r.blob())
    .then(readPhoto)
    .then(({ canvas, pixels }) => {
      // name follows the page language (the mosaic page reads it on every redraw)
      examplePhotos.set(key, { get name() { return t(`mosaicSample.${key}.label`); }, canvas, pixels });
      mosaicStatus('');
      if (location.pathname === mosaicPath(key)) openMosaicSample(key);
    })
    .catch((err) => {
      showStart();
      mosaicStatus(t('start.mosaic.failed', { message: err.message ?? err }));
    });
}

function showResult(source) {
  showPage('result');
  return loadViewer().then(({ stage }) => {
    stage.resize();
    page.show(source);
  });
}
/** A failure while loading a model, shown on the result page. */
const showError = (message) => loadViewer().then(() => page.onError(message));

function openSample(key) {
  const s = SAMPLES[key];
  const label = t(`sample.${key}.label`);
  const labelKey = `sample.${key}.label`;
  showResult({ id: `sample:${key}:loading`, labelKey, label, scene: null, data: null, loading: true });
  sources()
    .then(({ loadGltf, gltfSource }) =>
      loadGltf(s.url).then((gltf) => {
        if (location.pathname !== modelPath(key)) return; // moved on meanwhile
        return showResult({ ...gltfSource(`sample:${key}`, label, gltf), labelKey });
      }),
    )
    .catch((err) => showError(t('error.sample', { message: err.message ?? err })));
}

/** ?debug only: open any.glb by URL (vetting new samples; the server must allow CORS). */
function openUrl(url) {
  const label = url.split('/').pop().replace(/\.glb$/i, '');
  const requestedUrl = location.href;
  showResult({ id: `url:${url}:loading`, label, scene: null, data: null, loading: true });
  sources()
    .then(({ loadGltf, gltfSource }) =>
      loadGltf(url).then((gltf) => {
        if (location.href !== requestedUrl) return;
        return showResult(gltfSource(`url:${url}`, label, gltf));
      }),
    )
    .catch((err) => showError(t('error.sample', { message: err.message ?? err })));
}
