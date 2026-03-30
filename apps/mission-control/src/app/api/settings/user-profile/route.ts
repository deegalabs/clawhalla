import { NextResponse } from 'next/server';
import { readFile, writeFile, readdir, stat, copyFile } from 'fs/promises';
import { join } from 'path';
import { WORKSPACE } from '@/lib/paths';

const USER_MD_PATH = join(WORKSPACE, 'USER.md');

interface UserProfile {
  name: string;
  callName: string;
  pronouns: string;
  timezone: string;
  notes: string;
  context: string;
}

function parseUserMd(content: string): UserProfile {
  const profile: UserProfile = { name: '', callName: '', pronouns: '', timezone: '', notes: '', context: '' };

  const nameMatch = content.match(/\*\*Name:\*\*\s*(.*)/);
  if (nameMatch) profile.name = nameMatch[1].trim();

  const callMatch = content.match(/\*\*What to call them:\*\*\s*(.*)/);
  if (callMatch) profile.callName = callMatch[1].trim();

  const pronounsMatch = content.match(/\*\*Pronouns:\*\*\s*(.*)/);
  if (pronounsMatch) profile.pronouns = pronounsMatch[1].replace(/^_?\(?(optional)?\)?_?/, '').trim();

  const tzMatch = content.match(/\*\*Timezone:\*\*\s*(.*)/);
  if (tzMatch) profile.timezone = tzMatch[1].trim();

  const notesMatch = content.match(/\*\*Notes:\*\*\s*(.*)/);
  if (notesMatch) profile.notes = notesMatch[1].trim();

  const contextMatch = content.match(/## Context\s*\n([\s\S]*?)(?=\n---)/);
  if (contextMatch) {
    const ctx = contextMatch[1].trim();
    // Skip placeholder text
    if (!ctx.startsWith('_(')) {
      profile.context = ctx;
    }
  }

  return profile;
}

function generateUserMd(profile: UserProfile): string {
  return `# USER.md - About Your Human

- **Name:** ${profile.name}
- **What to call them:** ${profile.callName}
- **Pronouns:** ${profile.pronouns || '_(optional)_'}
- **Timezone:** ${profile.timezone}
- **Notes:** ${profile.notes}

## Context

${profile.context || '_(What do they care about? What projects are they working on? What annoys them? What makes them laugh? Build this over time.)_'}

---

The more you know, the better you can help. But remember — you're learning about a person, not building a dossier. Respect the difference.
`;
}

async function findSquadAgentDirs(): Promise<string[]> {
  const dirs: string[] = [];
  const squadsDir = join(WORKSPACE, 'squads');

  try {
    const squads = await readdir(squadsDir);
    for (const squad of squads) {
      const squadPath = join(squadsDir, squad);
      const squadStat = await stat(squadPath);
      if (!squadStat.isDirectory()) continue;

      const agents = await readdir(squadPath);
      for (const agent of agents) {
        const agentPath = join(squadPath, agent);
        const agentStat = await stat(agentPath);
        if (agentStat.isDirectory()) {
          dirs.push(agentPath);
        }
      }
    }
  } catch {
    // squads directory may not exist yet
  }

  return dirs;
}

export async function GET() {
  try {
    const content = await readFile(USER_MD_PATH, 'utf-8');
    const profile = parseUserMd(content);
    return NextResponse.json({ ok: true, profile });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to read USER.md';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const profile: UserProfile = {
      name: body.name || '',
      callName: body.callName || '',
      pronouns: body.pronouns || '',
      timezone: body.timezone || '',
      notes: body.notes || '',
      context: body.context || '',
    };

    const content = generateUserMd(profile);

    // Write to main workspace
    await writeFile(USER_MD_PATH, content, 'utf-8');

    // Copy to all squad agent directories
    const agentDirs = await findSquadAgentDirs();
    for (const dir of agentDirs) {
      try {
        await copyFile(USER_MD_PATH, join(dir, 'USER.md'));
      } catch {
        // Skip dirs where copy fails
      }
    }

    return NextResponse.json({ ok: true, copied: agentDirs.length });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to save USER.md';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
