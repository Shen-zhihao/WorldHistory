export const locales = ["zh-CN", "en"] as const;
export type Locale = typeof locales[number];
export const defaultLocale: Locale = "zh-CN";
export function normalizeLocale(value: string | null | undefined): Locale {
  return value?.toLowerCase().startsWith("en") ? "en" : defaultLocale;
}
