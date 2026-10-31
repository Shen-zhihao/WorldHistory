import { NextRequest, NextResponse } from "next/server";
import { queryMapEvents } from "@/lib/server/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(request: NextRequest) {
  const month = request.nextUrl.searchParams.get("month");
  if (!month || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
    return NextResponse.json({ error: "请选择有效的年月" }, { status: 400 });
  }
  return NextResponse.json(queryMapEvents(month));
}
