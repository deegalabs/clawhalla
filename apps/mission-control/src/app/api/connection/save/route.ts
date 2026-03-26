import { NextRequest, NextResponse } from 'next/server';
import { readFileSync, writeFileSync, existsSync } from 'fs';

const CONFIG_PATH = './data/connection.json';

export async function GET() {
  try {
    if (existsSync(CONFIG_PATH)) {
      const data = JSON.parse(readFileSync(CONFIG_PATH, 'utf-8'));
      return NextResponse.json({ ok: true, config: data });
    }
    return NextResponse.json({ ok: true, config: null });
  } catch {
    return NextResponse.json({ ok: true, config: null });
  }
}

export async function POST(req: NextRequest) {
  try {
    const config = await req.json();
    writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ ok: false, error: String(error) }, { status: 500 });
  }
}
