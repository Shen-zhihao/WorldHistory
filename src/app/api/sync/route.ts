import { NextRequest, NextResponse } from 'next/server';
import { startSync } from '@/lib/server/sync';
import { getStatus } from '@/lib/server/db';
export const runtime='nodejs';export const dynamic='force-dynamic';
export function POST(request:NextRequest){const origin=request.headers.get('origin');if(!origin||origin!==request.nextUrl.origin)return NextResponse.json({error:'仅允许本站发起同步'},{status:403});
 void startSync().catch(error=>console.error('[history] sync failed',error instanceof Error?error.message:'unknown error'));return NextResponse.json({accepted:true,sync:getStatus().sync},{status:202});}
