import { SUGGESTED_PROMPT } from '../../services/prompts.mjs';
import { t } from '../../i18n/index.mjs';

/**
 * "Use your own": a model file (.glb or.ldr), or a brick-style AI picture.
 * The picture upload is off (disabled in start.html) until an image-to-3D
 * service is connected; its handler and the mock in services/to3d.mjs stay
 * so connecting one only means enabling the input. "No picture yet?" opens
 * the suggested prompt with a copy button.
 *
 * @param {{ onFile: (file: File) => void, onPicture?: (file: File) => void, status: (text: string) => void }} handlers
 */
export function setupOwn({ onFile, onPicture, status }) {
  onFileInput('upload', onFile);
  onFileInput('upload-picture', (file) => {
    if (!onPicture) return;
    // Preview stays in the page; the file is never sent anywhere.
    const preview = document.getElementById('picture-preview');
    if (preview.src) URL.revokeObjectURL(preview.src);
    preview.src = URL.createObjectURL(file);
    preview.hidden = false;
    onPicture(file);
  });

  const toggle = document.getElementById('no-picture');
  const box = document.getElementById('prompt-box');
  toggle.addEventListener('click', () => {
    const open = toggle.getAttribute('aria-expanded') !== 'true';
    toggle.setAttribute('aria-expanded', String(open));
    box.hidden = !open;
  });

  // Suggested prompt for people's own AI image tool (services/prompts.mjs).
  const promptText = document.getElementById('prompt-text');
  promptText.textContent = SUGGESTED_PROMPT;
  document.getElementById('copy-prompt').addEventListener('click', () => {
    const done = () => status(t('start.prompt.copied'));
    const manual = () => {
      // No clipboard access (http, old browser): open the text and select it.
      promptText.closest('details').open = true;
      getSelection().selectAllChildren(promptText);
      status(t('start.prompt.manual'));
    };
    if (navigator.clipboard?.writeText) navigator.clipboard.writeText(SUGGESTED_PROMPT).then(done, manual);
    else manual();
  });
}

/** Call `handle` with the file chosen in a file input, then clear it so the same file can be chosen again. */
export function onFileInput(id, handle) {
  const input = document.getElementById(id);
  input.addEventListener('change', () => {
    const file = input.files[0];
    input.value = '';
    if (file) handle(file);
  });
}
