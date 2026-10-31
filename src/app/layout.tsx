import type { Metadata } from "next";
import { cookies } from "next/headers";
import { normalizeLocale } from "@/lib/locale";
import { normalizeTheme } from "@/lib/theme";
import "./globals.css";

export const metadata: Metadata = {
  title: "纪元 EPOCH · 世界历史地球仪",
  description: "在可交互的三维地球上，探索 1800 年至今的全球历史。按月回溯、按国家发现，每一件事件都可追溯出处。",
  applicationName: "纪元 EPOCH",
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const preferences = await cookies();
  const locale = normalizeLocale(preferences.get("epoch-locale")?.value);
  const theme = normalizeTheme(preferences.get("epoch-theme")?.value);
  return <html lang={locale} data-theme={theme}><body>{children}</body></html>;
}
