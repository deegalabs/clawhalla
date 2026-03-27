import { NextResponse } from 'next/server';
import { boardTemplates } from '@/lib/board-templates';

// GET /api/boards/templates — list available board templates
export async function GET() {
  return NextResponse.json(boardTemplates);
}
