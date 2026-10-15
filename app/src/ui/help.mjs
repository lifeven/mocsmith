/**
 * 「?」 buttons beside a setting: each names its explanation with aria-controls and opens or
 * closes it under the row (an inline disclosure, not an overlay, so nothing covers the page).
 * Bound once per page root by event delegation, so rows drawn later work too.
 *
 * @param {HTMLElement} root
 */
export function bindHelp(root) {
  root.addEventListener('click', (e) => {
    const b = e.target.closest('.help-toggle');
    if (!b || !root.contains(b)) return;
    const box = document.getElementById(b.getAttribute('aria-controls'));
    if (!box) return;
    const open = box.hidden;
    box.hidden = !open;
    b.setAttribute('aria-expanded', String(open));
  });
}
