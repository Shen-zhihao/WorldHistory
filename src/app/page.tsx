import HistoryAtlas from "@/components/history-atlas";

export const dynamic = "force-dynamic";

export default function Home() {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  return <HistoryAtlas today={today} />;
}
