/**
 * Example photos for the flat mosaic (public/samples/mosaic/). Sources and
 * licences: public/samples/README.md and the About page. Names are in the
 * locale files (`mosaicSample.<key>.label`). Opened at /mosaic/<key>/.
 *
 * The start page shows a mosaic preview and a small copy of each photo
 * (`preview`, `thumb`), made once by tools/mosaic-thumbs.sh with the mosaic
 * page's defaults, the way the 3D samples have thumbnails. The mosaic itself
 * is built when an example is opened.
 */
export const MOSAIC_SAMPLES = {
  labrador: { url: '/samples/mosaic/labrador.jpg' },
  wave: { url: '/samples/mosaic/great-wave.jpg' },
  starry: { url: '/samples/mosaic/starry-night.jpg' },
  pearl: { url: '/samples/mosaic/pearl-earring.jpg' },
};

for (const [key, s] of Object.entries(MOSAIC_SAMPLES)) {
  s.preview = `/previews/mosaics/${key}.webp`;
  s.thumb = `/previews/mosaics/${key}-photo.webp`;
}
