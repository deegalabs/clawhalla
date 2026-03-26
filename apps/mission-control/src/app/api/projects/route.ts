import { NextRequest, NextResponse } from 'next/server';
import { readFile, writeFile, mkdir } from 'fs/promises';
import { join } from 'path';

const WORKSPACE = process.env.WORKSPACE_PATH || join(process.env.HOME || '/home/clawdbot', '.openclaw/workspace');
const PROJECTS_FILE = join(WORKSPACE, 'config/projects.json');

interface Project {
  slug: string;
  name: string;
  status: string;
  description: string;
  squad: string | null;
  repo: string | null;
  site: string | null;
  tech: string[];
  createdAt: string;
  updatedAt: string;
}

async function loadProjects(): Promise<Project[]> {
  try {
    const raw = await readFile(PROJECTS_FILE, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

async function saveProjects(projects: Project[]): Promise<void> {
  await mkdir(join(WORKSPACE, 'config'), { recursive: true });
  await writeFile(PROJECTS_FILE, JSON.stringify(projects, null, 2));
}

// GET /api/projects — list all projects
export async function GET() {
  try {
    const projects = await loadProjects();
    return NextResponse.json({ ok: true, projects });
  } catch (error) {
    return NextResponse.json({ ok: false, error: String(error) }, { status: 500 });
  }
}

// POST /api/projects — create project
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    if (!body.name) return NextResponse.json({ ok: false, error: 'name required' }, { status: 400 });

    const projects = await loadProjects();
    const slug = body.slug || body.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');

    if (projects.find(p => p.slug === slug)) {
      return NextResponse.json({ ok: false, error: 'Project with this slug already exists' }, { status: 409 });
    }

    const project: Project = {
      slug,
      name: body.name,
      status: body.status || 'active',
      description: body.description || '',
      squad: body.squad || null,
      repo: body.repo || null,
      site: body.site || null,
      tech: body.tech || [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    projects.push(project);
    await saveProjects(projects);
    return NextResponse.json({ ok: true, project }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ ok: false, error: String(error) }, { status: 500 });
  }
}

// PATCH /api/projects — update project
export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const { slug, ...updates } = body;
    if (!slug) return NextResponse.json({ ok: false, error: 'slug required' }, { status: 400 });

    const projects = await loadProjects();
    const idx = projects.findIndex(p => p.slug === slug);
    if (idx === -1) return NextResponse.json({ ok: false, error: 'Not found' }, { status: 404 });

    if (updates.name !== undefined) projects[idx].name = updates.name;
    if (updates.status !== undefined) projects[idx].status = updates.status;
    if (updates.description !== undefined) projects[idx].description = updates.description;
    if (updates.squad !== undefined) projects[idx].squad = updates.squad;
    if (updates.repo !== undefined) projects[idx].repo = updates.repo;
    if (updates.site !== undefined) projects[idx].site = updates.site;
    if (updates.tech !== undefined) projects[idx].tech = updates.tech;
    projects[idx].updatedAt = new Date().toISOString();

    await saveProjects(projects);
    return NextResponse.json({ ok: true, project: projects[idx] });
  } catch (error) {
    return NextResponse.json({ ok: false, error: String(error) }, { status: 500 });
  }
}

// DELETE /api/projects — delete project
export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const slug = searchParams.get('slug');
    if (!slug) return NextResponse.json({ ok: false, error: 'slug required' }, { status: 400 });

    const projects = await loadProjects();
    const filtered = projects.filter(p => p.slug !== slug);
    if (filtered.length === projects.length) return NextResponse.json({ ok: false, error: 'Not found' }, { status: 404 });

    await saveProjects(filtered);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ ok: false, error: String(error) }, { status: 500 });
  }
}
