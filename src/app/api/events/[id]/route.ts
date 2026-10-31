import { NextRequest, NextResponse } from "next/server";
import { eventById } from "@/lib/server/db";
import { normalizeLocale } from "@/lib/locale";
import { localizeEvents } from "@/lib/server/translations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, context: { params: Promise<{id:string}> }) {
  const {id} = await context.params;
  if (!/^[a-f0-9]{24}(?:-map-[A-Z]{2})?$/.test(id)) return NextResponse.json({error:"Invalid event ID"},{status:400});
  const event = eventById(id);
  if (!event) return NextResponse.json({error:"Event not found"},{status:404});
  const result = await localizeEvents([{...event,id}],normalizeLocale(request.nextUrl.searchParams.get("locale")));
  return NextResponse.json({event:result.events[0],translation:result.translation});
}
