import { NextResponse } from 'next/server';
import { healthCheck } from '@/lib/gateway';

export async function GET() {
  const status = await healthCheck();
  return NextResponse.json({
    status: status ? 'ok' : 'error',
    timestamp: new Date().toISOString()
  });
}
