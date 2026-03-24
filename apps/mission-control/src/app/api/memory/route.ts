import { readdir, readFile, stat } from 'fs/promises';
import { join } from 'path';
import { NextResponse } from 'next/server';

const MEMORY_PATHS = [
  join(process.env.HOME || '/home/clawdbot', '.openclaw/workspace/memory'),
  join(process.env.HOME || '/home/clawdbot', '.openclaw/agents/main/workspace/memory'),
];

export async function GET() {
  const entries: Array<{
    name: string;
    path: string;
    date: string;
    size: number;
    wordCount: number;
    content: string;
    modifiedAt: string;
  }> = [];

  for (const basePath of MEMORY_PATHS) {
    try {
      const files = await readdir(basePath);
      for (const file of files.filter(f => f.endsWith('.md'))) {
        const fullPath = join(basePath, file);
        const content = await readFile(fullPath, 'utf-8');
        const stats = await stat(fullPath);
        entries.push({
          name: file,
          path: fullPath,
          date: file.replace('.md', ''),
          size: stats.size,
          wordCount: content.split(/\s+/).length,
          content: content,
          modifiedAt: stats.mtime.toISOString(),
        });
      }
    } catch {
      /* directory doesn't exist, skip */
    }
  }

  entries.sort((a, b) => b.date.localeCompare(a.date));
  return NextResponse.json(entries);
}
