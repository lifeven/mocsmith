import { kindName, shownKind, sizeText } from '../words.mjs';
import { t } from '../../i18n/index.mjs';
import { esc } from './texts.mjs';

/**
 * The model information behind the ⓘ beside the name: size, whether it is all
 * joined, parts by kind, loose parts before and after repair, recoloured cells,
 * seam plates and dropped crumbs when there are any, and how long the build took.
 *
 * @param {import('../../convert/build.mjs').BuiltModel} model
 * @param {{ latency: number, inWorker: boolean }} info
 * @param {boolean} imported read from a file, not built
 * @returns {string} a <dl> body
 */
export function detailsHtml(model, info, imported) {
  const { result, stats, before, counts } = model;
  const kinds = { brick: 0, plate: 0, tile: 0, slope: 0, inverted: 0, roundBrick: 0, roundPlate: 0, roundTile: 0 };
  for (const p of result.parts) kinds[shownKind(p)]++;
  for (const k of ['inverted', 'roundBrick', 'roundPlate', 'roundTile']) if (!kinds[k]) delete kinds[k];
  const f = (x) => x.toFixed(0);
  const detached = before.detachedParts === stats.detachedParts
    ? t('result.count', { n: stats.detachedParts })
    : t('result.d.detachedBefore', { before: before.detachedParts, now: stats.detachedParts });
  const compute = imported
    ? t('result.d.imported')
    : t(info.inWorker ? 'result.d.msWorker' : 'result.d.msPage', { total: f(model.ms.total) });
  return [
    [t('result.size'), sizeText(model.grid, result.parts)],
    [t('result.group.structure'), stats.detachedParts ? t('result.issueShort', { n: stats.detachedParts }) : t('result.d.joined')],
    [t('result.d.parts'), Object.entries(kinds).map(([k, n]) => `${kindName(k)} ${n}`).join(t('list.sep'))],
    [t('result.d.detached'), detached],
    [t('result.d.recoloured'), t('result.d.recolouredValue', { n: result.recolouredCells ?? 0 })],
    // Only when weld (after repair) had to add seam plates or drop crumbs.
    ...(counts.welds ? [[t('result.d.welds'), t('result.count', { n: counts.welds })]] : []),
    ...(counts.droppedCells ? [[t('result.d.dropped'), t('result.d.cells', { n: counts.droppedCells })]] : []),
    // Only when thickening is on and grew something (it changes the shape, so say how much).
    ...(counts.thickened ? [[t('result.d.thickened'), t('result.d.cells', { n: counts.thickened })]] : []),
    [t('result.d.compute'), compute],
  ]
    .map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`)
    .join('');
}
