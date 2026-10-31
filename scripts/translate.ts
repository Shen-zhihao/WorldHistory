import { queryEvents, todayShanghai } from "../src/lib/server/db";
import { localizeEvents, drainTranslations } from "../src/lib/server/translations";
import { writeSnapshot } from "../src/lib/server/snapshot";
import { normalizeLocale } from "../src/lib/locale";

async function main() {
  const option = (name: string) => process.argv.find(value => value.startsWith(`--${name}=`))?.split("=").slice(1).join("=");
  const month = option("month") || todayShanghai().slice(0, 7);
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new Error("请选择有效月份，例如 --month=1969-07");
  const locale = normalizeLocale(option("locale"));
  const limit = Math.min(30, Math.max(1, Number(option("limit")) || 10));
  const result = queryEvents({month,locale,scope:"countries",limit,country:option("country")});
  await localizeEvents(result.events,locale,{waitMs:0});
  await drainTranslations();
  const translated = await localizeEvents(result.events,locale,{enqueue:false,waitMs:0});
  const manifest = await writeSnapshot();
  console.log(JSON.stringify({month,locale,requested:result.events.length,available:translated.events.filter(event=>event.contentLocale===locale).length,storedTranslations:manifest.translations,error:translated.translation.error},null,2));
  if (translated.translation.error) process.exitCode=1;
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
