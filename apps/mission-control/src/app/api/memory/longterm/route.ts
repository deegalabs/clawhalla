import { readFile, stat } from 'fs/promises';
import { join } from 'path';
import { NextResponse } from 'next/server';

const MEMORY_PATH = join(process.env.HOME || '/home/clawdbot', '.openclaw/workspace/MEMORY.md');

export async function GET() {
  try {
    const content = await readFile(MEMORY_PATH, 'utf-8');
    const stats = await stat(MEMORY_PATH);
    
    return NextResponse.json({
      content,
      wordCount: content.split(/\s+/).length,
      modifiedAt: stats.mtime.toISOString(),
      size: stats.size,
    });
  } catch {
    return NextResponse.json({
      content: 'No long-term memory file found.',
      wordCount: 0,
      modifiedAt: null,
      size: 0,
    });
  }
}
