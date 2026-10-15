/**
 * Dense voxel grid in LEGO units.
 *
 * Axes: x and z are studs, y is plates (up). A cell value of 0 means empty;
 * any other value is a palette colour index + 1.
 */
export class VoxelGrid {
  /**
   * @param {number} sx width in studs
   * @param {number} sy height in plates
   * @param {number} sz depth in studs
   */
  constructor(sx, sy, sz) {
    this.sx = sx;
    this.sy = sy;
    this.sz = sz;
    this.cells = new Uint8Array(sx * sy * sz);
  }

  index(x, y, z) {
    return (y * this.sz + z) * this.sx + x;
  }

  inBounds(x, y, z) {
    return x >= 0 && y >= 0 && z >= 0 && x < this.sx && y < this.sy && z < this.sz;
  }

  get(x, y, z) {
    return this.inBounds(x, y, z) ? this.cells[this.index(x, y, z)] : 0;
  }

  set(x, y, z, value) {
    this.cells[this.index(x, y, z)] = value;
  }

  filledCount() {
    let n = 0;
    for (const v of this.cells) if (v) n++;
    return n;
  }
}
