import { ldrawCode } from '../../mosaic/palette.mjs';
import table from '../../data/mosaic-colours.json' with { type: 'json' };
import { t } from '../../i18n/index.mjs';

/** Names on the mosaic page and in its PDF: colours (Rebrickable ids) and LEGO Art sets. */

/**
 * Page name for a mosaic colour (Rebrickable id). Colour keys are LDraw
 * codes everywhere in the app (`colour.<LDraw code>`), so the id goes through
 * ldrawCode first; a colour with no key keeps LEGO's English name.
 */
export function mosaicColourName(code) {
  const key = `colour.${ldrawCode(code)}`;
  const name = t(key);
  return name === key ? table.colours[code].name : name;
}

/** A LEGO Art set's name in the page language, without its number; a set with no `mosaic.set.<number>` key keeps its English name. */
export function mosaicSetTitle({ id, name }) {
  const key = `mosaic.set.${id.replace(/-\d+$/, '')}`;
  const local = t(key);
  return local === key ? name : local;
}

/** Page name for a LEGO Art set ('31197-1'): number and name. */
export const mosaicSetName = (set) => `${set.id.replace(/-\d+$/, '')} ${mosaicSetTitle(set)}`;
