import { NextResponse } from 'next/server';
import { getStatus } from '@/lib/server/db';
export const runtime='nodejs';export const dynamic='force-dynamic';
export function GET(){return NextResponse.json(getStatus());}
