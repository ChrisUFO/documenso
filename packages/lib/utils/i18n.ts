import type { I18n, MessageDescriptor } from '@lingui/core';
import { i18n } from '@lingui/core';
import type { MacroMessageDescriptor } from '@lingui/core/macro';

import type { I18nLocaleData, SupportedLanguageCodes } from '../constants/i18n';
import { APP_I18N_OPTIONS } from '../constants/i18n';

type Messages = Record<string, string>;

function extractMessages(mod: unknown): Messages | undefined {
  if (mod && typeof mod === 'object') {
    const root = mod as Record<string, unknown>;

    if ('messages' in root && typeof root.messages === 'object') {
      return root.messages as Messages;
    }

    if ('default' in root && root.default && typeof root.default === 'object') {
      const def = root.default as Record<string, unknown>;

      if ('messages' in def && typeof def.messages === 'object') {
        return def.messages as Messages;
      }

      // Some compilers export the messages object as default directly
      return def as unknown as Messages;
    }
  }

  return undefined;
}

export async function getTranslations(locale: string) {
  const isBrowser = typeof window !== 'undefined' && typeof document !== 'undefined';

  // Prefer Vite's glob on the client where it's transformed at build time
  if (isBrowser) {
    try {
      const modules = import.meta.glob('../translations/*/web.{po,mjs}') as Record<
        string,
        () => Promise<unknown>
      >;

      const poKey = `../translations/${locale}/web.po`;
      const mjsKey = `../translations/${locale}/web.mjs`;

      const loader = modules[poKey] || modules[mjsKey];

      if (loader) {
        const mod = await loader();
        const messages = extractMessages(mod);
        if (messages) return messages;
      }
    } catch {
      // Fall through to dynamic import below
    }
  }

  // Fallback for SSR or environments where Vite's transform isn't available
  try {
    const mod = (await import(`../translations/${locale}/web.po`)) as unknown;
    const messages = extractMessages(mod);
    if (messages) return messages;
  } catch {
    // ignore: will try .mjs next
  }

  const mod2 = (await import(`../translations/${locale}/web.mjs`)) as unknown;
  const messages2 = extractMessages(mod2);
  if (!messages2) {
    throw new Error(`Missing translations for locale: ${locale}`);
  }
  return messages2;
}

export async function dynamicActivate(locale: string) {
  const messages = await getTranslations(locale);

  i18n.loadAndActivate({ locale, messages });
}

const parseLanguageFromLocale = (locale: string): SupportedLanguageCodes | null => {
  const [language, _country] = locale.split('-');

  const foundSupportedLanguage = APP_I18N_OPTIONS.supportedLangs.find(
    (lang): lang is SupportedLanguageCodes => lang === language,
  );

  if (!foundSupportedLanguage) {
    return null;
  }

  return foundSupportedLanguage;
};

/**
 * Extracts the language from the `accept-language` header.
 */
export const extractLocaleDataFromHeaders = (
  headers: Headers,
): { lang: SupportedLanguageCodes | null; locales: string[] } => {
  const headerLocales = (headers.get('accept-language') ?? '').split(',');

  const language = parseLanguageFromLocale(headerLocales[0]);

  return {
    lang: language,
    locales: [headerLocales[0]],
  };
};

type ExtractLocaleDataOptions = {
  headers: Headers;
};

/**
 * Extract the supported language from the header.
 *
 * Will return the default fallback language if not found.
 */
export const extractLocaleData = ({ headers }: ExtractLocaleDataOptions): I18nLocaleData => {
  const headerLocales = (headers.get('accept-language') ?? '').split(',');

  const unknownLanguages = headerLocales
    .map((locale) => parseLanguageFromLocale(locale))
    .filter((value): value is SupportedLanguageCodes => value !== null);

  // Filter out locales that are not valid.
  const languages = (unknownLanguages ?? []).filter((language) => {
    try {
      new Intl.Locale(language);
      return true;
    } catch {
      return false;
    }
  });

  return {
    lang: languages[0] || APP_I18N_OPTIONS.sourceLang,
    locales: headerLocales,
  };
};

export const parseMessageDescriptor = (_: I18n['_'], value: string | MessageDescriptor) => {
  return typeof value === 'string' ? value : _(value);
};

export const parseMessageDescriptorMacro = (
  t: (descriptor: MacroMessageDescriptor) => string,
  value: string | MessageDescriptor,
) => {
  return typeof value === 'string' ? value : t(value);
};
