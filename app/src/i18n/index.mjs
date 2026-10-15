/**
 * Page text in several languages.
 *
 * Every string shown to people lives in a flat JSON file per language
 * (`zh-CN.json`, `en.json`, same keys, `{name}` placeholders). Static HTML
 * names its key in an attribute (`data-i18n` for text, `data-i18n-aria` for
 * aria-label, `data-i18n-content` for a meta tag's content, `data-i18n-alt`
 * for an image's alt text); code calls
 * `t(key, vars)`. Switching language re-applies the attributes and fires a
 * `localechange` event on `document` so pages can redraw their own text.
 *
 * Adding a language: copy `en.json` to `<id>.json`, translate the values, and
 * add an entry to `LOCALES` below.
 */

import zhCN from './zh-CN.json' with { type: 'json' };
import en from './en.json' with { type: 'json' };

/** Languages in the order the switch shows them. `id` is a BCP 47 tag, used for `<html lang>`. */
export const LOCALES = [
  { id: 'zh-CN', label: '中文', messages: zhCN },
  { id: 'en', label: 'EN', messages: en },
];

/** The language every key is written in first; missing keys fall back to it. */
export const SOURCE_LOCALE = 'zh-CN';
/** Used when none of the browser's languages is offered. */
const FALLBACK_LOCALE = 'en';
const STORAGE_KEY = 'mocsmith.locale';

const byId = new Map(LOCALES.map((l) => [l.id, l.messages]));
let current = SOURCE_LOCALE;

/** The current language id. */
export const locale = () => current;

/**
 * Text for `key` in the current language, with `{name}` replaced from `vars`.
 * When `vars.n` is a number, a plural form `key#one` / `key#few` / … (CLDR
 * categories from Intl.PluralRules) is used if the language has one, e.g.
 * en "result.count#one": "{n} part" beside "result.count": "{n} parts".
 */
export function t(key, vars) {
  const messages = byId.get(current);
  let text;
  if (typeof vars?.n === 'number') text = messages[`${key}#${pluralRules(current).select(vars.n)}`];
  text ??= messages[key] ?? byId.get(SOURCE_LOCALE)[key] ?? key;
  if (!vars) return text;
  return text.replace(/\{(\w+)\}/g, (whole, name) => (name in vars ? String(vars[name]) : whole));
}

const rulesCache = new Map();
function pluralRules(id) {
  if (!rulesCache.has(id)) rulesCache.set(id, new Intl.PluralRules(id));
  return rulesCache.get(id);
}

/**
 * Which language to start in: a stored choice if it is still offered, else
 * the first browser language that matches an offered one (exactly, or by its
 * primary subtag: "zh-TW" → "zh-CN", "en-GB" → "en"), else English.
 */
export function pickLocale(stored, languages = []) {
  if (stored && byId.has(stored)) return stored;
  for (const lang of languages) {
    if (byId.has(lang)) return lang;
    const primary = lang.split('-')[0].toLowerCase();
    const match = LOCALES.find((l) => l.id.split('-')[0].toLowerCase() === primary);
    if (match) return match.id;
  }
  return FALLBACK_LOCALE;
}

/** Fill every element under `root` that names a key. */
export function applyI18n(root = document) {
  for (const el of root.querySelectorAll('[data-i18n]')) el.textContent = t(el.dataset.i18n);
  for (const el of root.querySelectorAll('[data-i18n-aria]')) el.setAttribute('aria-label', t(el.dataset.i18nAria));
  for (const el of root.querySelectorAll('[data-i18n-content]')) el.setAttribute('content', t(el.dataset.i18nContent));
  for (const el of root.querySelectorAll('[data-i18n-alt]')) el.setAttribute('alt', t(el.dataset.i18nAlt));
}

/** Switch language: update `<html lang>` and static text, tell the pages; remember it if the visitor chose it. */
export function setLocale(id, { remember = true } = {}) {
  if (!byId.has(id)) throw new Error(`unknown locale ${id}`);
  current = id;
  if (typeof document === 'undefined') return; // Node (tests): only the text changes
  if (remember) {
    try {
      localStorage.setItem(STORAGE_KEY, id);
    } catch {
      // Private mode or storage disabled: the choice lasts for this page only.
    }
  }
  document.documentElement.lang = id;
  applyI18n();
  for (const b of document.querySelectorAll('button[data-locale]')) b.setAttribute('aria-pressed', String(b.dataset.locale === id));
  document.dispatchEvent(new CustomEvent('localechange', { detail: { locale: id } }));
}

/** Start in the remembered or browser language, and build the language switch into `container`. */
export function setupI18n(container) {
  let stored = null;
  try {
    stored = localStorage.getItem(STORAGE_KEY);
  } catch {
    // Storage blocked: fall back to the browser language.
  }
  container.innerHTML = LOCALES.map(
    (l) => `<button type="button" data-locale="${l.id}" lang="${l.id}" aria-pressed="false">${l.label}</button>`,
  ).join('');
  container.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-locale]');
    if (b && b.dataset.locale !== current) setLocale(b.dataset.locale);
  });
  setLocale(pickLocale(stored, navigator.languages ?? [navigator.language]), { remember: false });
}
