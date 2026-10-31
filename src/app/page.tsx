import HistoryAtlas from "@/components/history-atlas";
import { cookies } from "next/headers";
import { normalizeLocale } from "@/lib/locale";

export const dynamic = "force-dynamic";

export default async function Home() {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const initialLocale = normalizeLocale((await cookies()).get("epoch-locale")?.value);
  return <HistoryAtlas today={today} initialLocale={initialLocale} />;
}
