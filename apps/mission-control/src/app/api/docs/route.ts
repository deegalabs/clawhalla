import { readdir, readFile, stat } from 'fs/promises';
import { join, relative } from 'path';
import { NextRequest, NextResponse } from 'next/server';

const WORKSPACE = join(process.env.HOME || '/home/clawdbot', '.openclaw/workspace');
const SKIP = ['node_modules', '.next', '.git', '.cache', 'venv', '__pycache__'];

interface DocEntry {
  name: string;
  path: string;
  category: string;
  size: number;
  wordCount: number;
  modifiedAt: string;
  content: string;
}

function inferCategory(path: string): string {
  const lower = path.toLowerCase();
  if (lower.includes('memory')) return 'Journal';
  if (lower.includes('knowledge') || lower.includes('insight')) return 'Insights';
  if (lower.includes('transcri')) return 'Transcription';
  if (lower.includes('adr') || lower.includes('decision')) return 'ADR';
  if (lower.includes('report')) return 'Report';
  return 'Other';
}

const MAX_DOCS = 200;

async function scanDir(dir: string, files: DocEntry[] = []): Promise<DocEntry[]> {
  if (files.length >= MAX_DOCS) return files;
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (files.length >= MAX_DOCS) break;
      if (SKIP.includes(entry.name)) continue;
      const fullPath = join(dir, entry.name);

      if (entry.isDirectory()) {
        await scanDir(fullPath, files);
      } else if (entry.name.endsWith('.md') || entry.name.endsWith('.yaml')) {
        try {
          const content = await readFile(fullPath, 'utf-8');
          const stats = await stat(fullPath);
          const relPath = relative(WORKSPACE, fullPath);
          files.push({
            name: entry.name,
            path: relPath,
            category: inferCategory(relPath),
            size: stats.size,
            wordCount: content.split(/\s+/).length,
            modifiedAt: stats.mtime.toISOString(),
            content: content.slice(0, 5000),
          });
        } catch {
          /* skip unreadable files */
        }
      }
    }
  } catch {
    /* skip inaccessible dirs */
  }
  return files;
}

export async function GET(req: NextRequest) {
  const limit = Math.min(parseInt(req.nextUrl.searchParams.get('limit') || '100'), MAX_DOCS);
  const files = await scanDir(WORKSPACE);
  files.sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt));
  return NextResponse.json(files.slice(0, limit));
}
