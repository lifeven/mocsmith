/**
 * A download's file name from a model or photo name: characters file systems
 * refuse and white space become '-', none at either end; 'model' when nothing is left.
 * Its own module so the mosaic page names its files without loading the.ldr
 * export and the step planner behind it (io/ldr.mjs).
 * @param {string} name
 */
export function fileStem(name) {
  return name.replace(/[\\/:*?"<>|\s]+/g, '-').replace(/^-+|-+$/g, '') || 'model';
}
