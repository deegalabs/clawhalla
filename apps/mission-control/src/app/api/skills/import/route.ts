import { NextResponse } from 'next/server';
import { readdir, writeFile, mkdir } from 'fs/promises';
import { join } from 'path';

const WORKSPACE = process.env.WORKSPACE_PATH || join(process.env.HOME || '/home/clawdbot', '.openclaw/workspace');
const SKILLS_DIR = join(WORKSPACE, 'skills');

// GET /api/skills/import — list installed skills
export async function GET() {
  try {
    const categories: { category: string; skills: string[] }[] = [];

    const dirs = await readdir(SKILLS_DIR, { withFileTypes: true });
    for (const dir of dirs) {
      if (dir.isDirectory()) {
        try {
          const files = await readdir(join(SKILLS_DIR, dir.name));
          const skills = files.filter(f => f.endsWith('.md')).map(f => f.replace('.md', ''));
          if (skills.length > 0) {
            categories.push({ category: dir.name, skills });
          }
        } catch { continue; }
      }
    }

    return NextResponse.json({ ok: true, categories });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to list skills';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

// POST /api/skills/import — import a skill from URL or raw content
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { url, content, name, category } = body;

    if (!name || !category) {
      return NextResponse.json({ ok: false, error: 'name and category required' }, { status: 400 });
    }

    let skillContent: string;

    if (content) {
      // Direct content provided
      skillContent = content;
    } else if (url) {
      // Fetch from URL
      const res = await fetch(url, {
        headers: { 'User-Agent': 'ClawHalla-MC/1.0' },
      });

      if (!res.ok) {
        return NextResponse.json({ ok: false, error: `Failed to fetch URL: ${res.status}` }, { status: 400 });
      }

      const rawContent = await res.text();

      // Try to extract markdown from HTML if needed
      if (rawContent.includes('<!DOCTYPE') || rawContent.includes('<html')) {
        // Basic HTML to text extraction
        skillContent = rawContent
          .replace(/<script[\s\S]*?<\/script>/gi, '')
          .replace(/<style[\s\S]*?<\/style>/gi, '')
          .replace(/<[^>]+>/g, '\n')
          .replace(/\n{3,}/g, '\n\n')
          .trim();
      } else {
        skillContent = rawContent;
      }
    } else {
      return NextResponse.json({ ok: false, error: 'Either url or content required' }, { status: 400 });
    }

    // Save skill
    const categoryDir = join(SKILLS_DIR, category);
    await mkdir(categoryDir, { recursive: true });

    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const filePath = join(categoryDir, `${slug}.md`);

    // Add header if not already markdown
    if (!skillContent.startsWith('#')) {
      skillContent = `# Skill — ${name}\n\n**Source:** ${url || 'manual'}\n**Imported:** ${new Date().toISOString().split('T')[0]}\n\n---\n\n${skillContent}`;
    }

    await writeFile(filePath, skillContent);

    return NextResponse.json({
      ok: true,
      skill: {
        name,
        category,
        path: `skills/${category}/${slug}.md`,
        size: skillContent.length,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Import failed';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
