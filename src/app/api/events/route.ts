import { NextRequest, NextResponse } from 'next/server';
import { queryEvents } from '@/lib/server/db';
import { normalizeLocale } from '@/lib/locale';
import { localizeEvents } from '@/lib/server/translations';
export const runtime='nodejs';export const dynamic='force-dynamic';
export async function GET(request:NextRequest){const p=request.nextUrl.searchParams;const locale=normalizeLocale(p.get('locale'));const month=p.get('month')||undefined;const country=p.get('country')||undefined;const category=p.get('category')||undefined;const from=p.get('from')||undefined;const to=p.get('to')||undefined;
 if([from,to].some(value=>value&&!/^\d{4}-(0[1-9]|1[0-2])$/.test(value))||(from&&to&&from>to))return NextResponse.json({error:'Invalid date range'},{status:400});
 if(month&&!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)||country&&!/^[A-Z]{2}$/.test(country)||category&&!['politics','conflict','science','culture','economy','disaster','society'].includes(category))return NextResponse.json({error:'无效的筛选条件'},{status:400});
 const result=queryEvents({month,country,category,from,to,locale,scope:p.get('scope')||undefined,q:p.get('q')?.slice(0,200)||undefined,page:Number(p.get('page'))||1,limit:Number(p.get('limit'))||20});
 return NextResponse.json({...result,...await localizeEvents(result.events,locale)});}
