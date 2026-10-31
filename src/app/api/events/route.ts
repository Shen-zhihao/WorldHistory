import { NextRequest, NextResponse } from 'next/server';
import { queryEvents } from '@/lib/server/db';
export const runtime='nodejs';export const dynamic='force-dynamic';
export function GET(request:NextRequest){const p=request.nextUrl.searchParams;const month=p.get('month')||undefined;const country=p.get('country')||undefined;const category=p.get('category')||undefined;const from=p.get('from')||undefined;const to=p.get('to')||undefined;
 if([from,to].some(value=>value&&!/^\d{4}-(0[1-9]|1[0-2])$/.test(value))||(from&&to&&from>to))return NextResponse.json({error:'Invalid date range'},{status:400});
 if(month&&!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)||country&&!/^[A-Z]{2}$/.test(country)||category&&!['politics','conflict','science','culture','economy','disaster','society'].includes(category))return NextResponse.json({error:'无效的筛选条件'},{status:400});
 return NextResponse.json(queryEvents({month,country,category,from,to,scope:p.get('scope')||undefined,q:p.get('q')?.slice(0,200)||undefined,page:Number(p.get('page'))||1,limit:Number(p.get('limit'))||20}));}
