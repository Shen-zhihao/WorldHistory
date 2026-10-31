import { NextRequest, NextResponse } from "next/server";
import { queryMapEvents } from "@/lib/server/db";
import { normalizeLocale } from "@/lib/locale";
import { localizeEvents } from "@/lib/server/translations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const month = request.nextUrl.searchParams.get("month");
  if (!month || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
    return NextResponse.json({ error: "请选择有效的年月" }, { status: 400 });
  }
  const result = queryMapEvents(month);
  return NextResponse.json({...result, ...await localizeEvents(result.events,normalizeLocale(request.nextUrl.searchParams.get("locale")),{enqueue:false,waitMs:0})});
}
