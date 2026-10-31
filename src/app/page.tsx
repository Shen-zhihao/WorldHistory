import HistoryAtlas from "@/components/history-atlas";
import { cookies } from "next/headers";
import { normalizeLocale } from "@/lib/locale";
import { normalizeTheme } from "@/lib/theme";

export const dynamic = "force-dynamic";

export default async function Home() {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const preferences = await cookies();
  const initialLocale = normalizeLocale(preferences.get("epoch-locale")?.value);
  const initialTheme = normalizeTheme(preferences.get("epoch-theme")?.value);
  return <HistoryAtlas today={today} initialLocale={initialLocale} initialTheme={initialTheme} />;
}
