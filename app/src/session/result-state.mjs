import { withDefaults } from '../convert/config.mjs';
import { NO_PAINT } from '../core/paint.mjs';
import { createHistory } from './history.mjs';

/**
 * Everything the result page knows about the model it shows. No DOM here:
 * the page modules (`ui/result/`) read and change these fields.
 *
 * @param {Partial<import('../convert/build.mjs').BuildSettings>} [overrides] URL configuration overrides
 */
export function createResultState(overrides = {}) {
  return {
    /** @type {{ id: string, label?: string, labelKey?: string, scene: object | null, data?: object, imported?: object, loading?: boolean } | null} */
    source: null,
    settings: withDefaults(overrides),
    /** 'orbit' (whole model) or 'layers' (build mode, one step at a time) */
    mode: 'orbit',
    model: null,
    /** { latency, inWorker } of the last build */
    info: null,
    /** source id and size the camera was last framed for */
    framedFor: '',
    /** groups of parts not joined to the main body (ui/marks.mjs), and the one shown last by 「在哪」 */
    groups: [],
    groupIndex: -1,
    busyTimer: 0,
    /** grey out all but the red parts after 「在哪」 */
    spotlight: false,
    /** build mode: one kind of part picked in the step's list, { step, key, ids } (ui/result/build-bar.mjs) */
    stepFocus: null,
    /** source model and bricks side by side */
    compare: false,
    /** recolours (core/paint.mjs), sent with every build */
    paint: NO_PAINT,
    paintHistory: createHistory(),
    /** { color, partId } whose replacement is being picked; partId −1 = the whole colour */
    picking: null,
    /** the last build failed (the summary shows the error) */
    failed: false,
    /** 「编辑零件」: the part list is frozen and edited part by part (core/edit.mjs) */
    editing: false,
    /** models before each part edit; cleared when the pipeline lays the bricks out again */
    editHistory: createHistory(),
  };
}
