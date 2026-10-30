import { normalizeLang, type Lang } from '@genoffice/i18n'

/** The UI language the host asks for with `?lang=` (unsupported or missing: 'en'); always 'en' outside an embed. */
export const embedLang = (search: string, embedded: boolean): Lang =>
  embedded ? normalizeLang(new URLSearchParams(search).get('lang')) : 'en'
