import { exportLdr, exportPartsCsv, fileStem } from '../../io/ldr.mjs';
import { planBuild } from '../../steps/plan.mjs';
import { cm } from '../words.mjs';
import { download } from '../download.mjs';
import { t } from '../../i18n/index.mjs';
import { el, labelOf } from './texts.mjs';

/**
 * 「导出」: the model as shown (with recolours and edits) as `.ldr` with the
 * build plan's steps, and as a parts list; named after the source and size.
 *
 * @param {import('./index.mjs').ResultPage} page
 */
export function setupDownloads(page) {
  const { state } = page;
  const nameOf = () => `${labelOf(state.source)} ${cm(state.model.settings.lengthStuds)}`;

  el('download-ldr').addEventListener('click', () => {
    if (!state.model) return;
    const name = nameOf();
    download(`${fileStem(name)}.ldr`, exportLdr(state.model, name, planBuild(state.model)), 'text/plain');
  });
  el('download-csv').addEventListener('click', () => {
    if (!state.model) return;
    const name = t('result.file.parts', { name: nameOf() });
    download(`${fileStem(name)}.csv`, exportPartsCsv(state.model), 'text/csv');
  });
}
