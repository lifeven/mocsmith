/**
 * Reading the visitor's photo for the mosaic page. Its own small module so the
 * start page can read a photo before the mosaic page itself (index.mjs, loaded
 * on the first visit to /mosaic/) has been downloaded.
 */

/** Longest side the photo is drawn at before sampling (160 studs → ≥ 6 px per cell). */
export const MAX_SIDE = 1024;

/**
 * Read an image file into pixels, long side at most MAX_SIDE.
 * @param {Blob} file
 * @returns {Promise<{ canvas: HTMLCanvasElement, pixels: ImageData }>}
 */
export async function readPhoto(file) {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close?.();
  return { canvas, pixels: ctx.getImageData(0, 0, canvas.width, canvas.height) };
}
