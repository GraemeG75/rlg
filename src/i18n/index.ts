import type { I18nVars } from '../types';
import { en } from './en';

type LocaleKey = 'en';

const locales: Record<LocaleKey, Record<string, string>> = { en };
let currentLocale: LocaleKey = 'en';

/**
 * Sets the active locale for translations.
 * @param locale The locale key to activate.
 */
export function setLocale(locale: LocaleKey): void {
  if (locales[locale]) {
    currentLocale = locale;
  }
}

/**
 * Translates a key using the active locale and optional variables.
 * @param key The translation key.
 * @param vars Optional template variables.
 * @returns The translated string.
 */
export function t(key: string, vars?: I18nVars): string {
  const dict: Record<string, string> = locales[currentLocale] ?? locales.en;
  const template: string = dict[key] ?? key;
  if (!vars) {
    return template;
  }
  return template.replace(/\{(\w+)\}/g, (_match: string, name: string) => String(vars[name] ?? `{${name}}`));
}
