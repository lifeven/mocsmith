import { BrickView } from '../../render/bricks.mjs';
import { Stage } from '../../render/stage.mjs';
import { createResultPage } from './index.mjs';

/**
 * The 3D side of the site: the stage, the brick view and the result page on
 * them. `main.mjs` loads this module the first time a model is shown, so the
 * start, mosaic and about pages open without three.js (about 600 KB).
 *
 * @param {{ builder: object, settings?: object }} options
 */
export function createViewer({ builder, settings }) {
  const stage = new Stage(document.getElementById('view'));
  const bricks = new BrickView(stage.bricks);
  const page = createResultPage({ stage, bricks, builder, settings });
  return { stage, bricks, page };
}
