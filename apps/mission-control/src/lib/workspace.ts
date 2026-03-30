import { readFile, readdir, stat } from 'fs/promises';
import { join } from 'path';
import { parse as parseYaml } from 'yaml';
import { WORKSPACE as WORKSPACE_PATH } from '@/lib/paths';

// ---------------------------------------------------------------------------
// Workspace path resolution
// ---------------------------------------------------------------------------

export function workspacePath(...segments: string[]): string {
  return join(WORKSPACE_PATH, ...segments);
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AgentManifest {
  name: string;
  displayName: string;
  title: string;
  squad: string;
  model: string;
  emoji: string;
  role: string;
  domain: string[];
  capabilities: Record<string, string> | string[];
  communicationStyle?: string;
  reportsTo?: string;
  reviewedBy?: string;
  failureLimit?: number;
  executionModes?: string[];
}

export interface AgentIdentity {
  epithet?: string;
  vibe?: string;
  mythology?: string;
}

export interface Agent {
  id: string; // folder name (e.g. "backend")
  manifest: AgentManifest;
  identity: AgentIdentity;
}

export interface Squad {
  id: string; // folder name (e.g. "dev")
  agents: Agent[];
}

export interface BoardTask {
  id: string;
  title: string;
  column: string;
  assignee?: string;
  points?: number;
  priority?: string;
  epic?: string;
  status: 'pending' | 'doing' | 'review' | 'blocked' | 'done';
  metadata: Record<string, string>;
}

export interface SquadBoard {
  squadId: string;
  sprintName?: string;
  sprintDates?: string;
  velocity?: string;
  epic?: string;
  squadMembers?: string;
  columns: { name: string; tasks: BoardTask[] }[];
}

// ---------------------------------------------------------------------------
// Agent readers
// ---------------------------------------------------------------------------

async function readManifest(squadId: string, agentDir: string): Promise<AgentManifest | null> {
  try {
    const raw = await readFile(workspacePath('squads', squadId, agentDir, 'manifest.yaml'), 'utf-8');
    const parsed = parseYaml(raw);
    if (!parsed || typeof parsed !== 'object') return null;

    // Normalize capabilities from array to record if needed
    let capabilities: Record<string, string> | string[] = parsed.capabilities || [];
    if (Array.isArray(capabilities)) {
      const record: Record<string, string> = {};
      for (const item of capabilities) {
        if (typeof item === 'object' && item !== null) {
          for (const [k, v] of Object.entries(item)) {
            record[k] = String(v);
          }
        } else if (typeof item === 'string') {
          const match = item.match(/^(\w+):\s*(.+)$/);
          if (match) record[match[1]] = match[2];
          else record[item] = item;
        }
      }
      capabilities = record;
    }

    return {
      name: parsed.name || agentDir,
      displayName: parsed.displayName || parsed.name || agentDir,
      title: parsed.title || 'Agent',
      squad: parsed.squad || squadId,
      model: parsed.model || 'unknown',
      emoji: parsed.emoji || '🤖',
      role: parsed.role || 'agent',
      domain: Array.isArray(parsed.domain) ? parsed.domain : [],
      capabilities,
      communicationStyle: parsed.communicationStyle,
      reportsTo: parsed.reportsTo,
      reviewedBy: parsed.reviewedBy,
      failureLimit: parsed.failureLimit,
      executionModes: parsed.executionModes,
    };
  } catch {
    return null;
  }
}

function extractField(content: string, field: string): string | undefined {
  const re = new RegExp(`\\*\\*${field}:\\*\\*\\s*(.+)`, 'i');
  const match = content.match(re);
  return match ? match[1].trim() : undefined;
}

async function readIdentity(squadId: string, agentDir: string): Promise<AgentIdentity> {
  try {
    const raw = await readFile(workspacePath('squads', squadId, agentDir, 'IDENTITY.md'), 'utf-8');
    const epithet = extractField(raw, 'Epithet');
    const vibe = extractField(raw, 'Vibe');

    // Extract mythology section
    const mythMatch = raw.match(/## Mythology\s*\n([\s\S]*?)(?=\n##|$)/);
    const mythology = mythMatch ? mythMatch[1].trim() : undefined;

    return { epithet, vibe, mythology };
  } catch {
    return {};
  }
}

export async function getSquads(): Promise<Squad[]> {
  const squadsDir = workspacePath('squads');
  const entries = await readdir(squadsDir, { withFileTypes: true });
  const squads: Squad[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const squad = await getSquad(entry.name);
    if (squad) squads.push(squad);
  }

  return squads;
}

export async function getSquad(squadId: string): Promise<Squad | null> {
  const squadDir = workspacePath('squads', squadId);
  try {
    const s = await stat(squadDir);
    if (!s.isDirectory()) return null;
  } catch {
    return null;
  }

  const entries = await readdir(squadDir, { withFileTypes: true });
  const agents: Agent[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const manifest = await readManifest(squadId, entry.name);
    if (!manifest) continue;

    const identity = await readIdentity(squadId, entry.name);
    agents.push({ id: entry.name, manifest, identity });
  }

  return { id: squadId, agents };
}

// ---------------------------------------------------------------------------
// Board parser
// ---------------------------------------------------------------------------

const COLUMN_NAMES = ['backlog', 'doing', 'review', 'blocked', 'done'];

function columnToStatus(col: string): BoardTask['status'] {
  const lower = col.toLowerCase();
  if (lower === 'backlog') return 'pending';
  if (lower === 'doing') return 'doing';
  if (lower === 'review') return 'review';
  if (lower === 'blocked') return 'blocked';
  if (lower === 'done') return 'done';
  return 'pending';
}

function parseTaskLine(line: string, column: string): BoardTask | null {
  // Format: - [ ] ID | Description | @assignee | pts:N | priority:level | key:value
  // Or:     - [x] ID | Description | @assignee | done:YYYY-MM-DD
  const taskMatch = line.match(/^-\s*\[([x~! ])\]\s*(.+)$/);
  if (!taskMatch) return null;

  const parts = taskMatch[2].split('|').map(p => p.trim());
  if (parts.length < 2) return null;

  const id = parts[0];
  const title = parts[1];
  const metadata: Record<string, string> = {};
  let assignee: string | undefined;
  let points: number | undefined;
  let priority: string | undefined;
  let epic: string | undefined;

  for (let i = 2; i < parts.length; i++) {
    const part = parts[i];
    if (part.startsWith('@')) {
      assignee = part;
    } else if (part.startsWith('pts:')) {
      points = parseInt(part.replace('pts:', ''), 10) || undefined;
    } else if (part.startsWith('priority:')) {
      priority = part.replace('priority:', '');
    } else if (part.startsWith('epic:')) {
      epic = part.replace('epic:', '');
    } else if (part.includes(':')) {
      const [k, ...v] = part.split(':');
      metadata[k.trim()] = v.join(':').trim();
    } else if (part.startsWith('@')) {
      // Multiple assignees
      if (assignee) assignee += ` ${part}`;
      else assignee = part;
    }
  }

  return {
    id,
    title,
    column,
    assignee,
    points,
    priority,
    epic,
    status: columnToStatus(column),
    metadata,
  };
}

export async function getSquadBoard(squadId: string): Promise<SquadBoard | null> {
  const boardPath = workspacePath('boards', 'squads', squadId, 'board.md');
  let content: string;
  try {
    content = await readFile(boardPath, 'utf-8');
  } catch {
    return null;
  }

  const lines = content.split('\n');

  // Parse header
  let sprintName: string | undefined;
  let sprintDates: string | undefined;
  let velocity: string | undefined;
  let epic: string | undefined;
  let squadMembers: string | undefined;

  for (const line of lines.slice(0, 10)) {
    if (line.startsWith('# ')) continue;
    if (line.startsWith('>')) {
      const text = line.replace(/^>\s*/, '');
      // Sprint line: "Sprint 2: Dashboard... | 2026-03-20 → 2026-04-03 | ..."
      const sprintMatch = text.match(/Sprint\s*\d+[^|]*/);
      if (sprintMatch) sprintName = sprintMatch[0].trim();

      const dateMatch = text.match(/\d{4}-\d{2}-\d{2}\s*→\s*\d{4}-\d{2}-\d{2}/);
      if (dateMatch) sprintDates = dateMatch[0];

      const velMatch = text.match(/Velocity:\s*(\d+\s*pts?)/i);
      if (velMatch) velocity = velMatch[1];

      const epicMatch = text.match(/Epic:\s*(EPIC-\d+)/i);
      if (epicMatch) epic = epicMatch[1];

      // Squad members line
      if (text.includes('@')) {
        squadMembers = text.replace(/^Squad:\s*/i, '').trim();
      }
    }
  }

  // Parse columns
  const columns: { name: string; tasks: BoardTask[] }[] = [];
  let currentColumn: string | null = null;

  for (const line of lines) {
    const sectionMatch = line.match(/^##\s+(.+)/);
    if (sectionMatch) {
      const name = sectionMatch[1].trim();
      const isColumn = COLUMN_NAMES.some(c => name.toLowerCase().startsWith(c));
      if (isColumn) {
        currentColumn = name;
        columns.push({ name, tasks: [] });
      } else {
        currentColumn = null;
      }
      continue;
    }

    if (currentColumn && line.startsWith('- [')) {
      const task = parseTaskLine(line, currentColumn.toLowerCase());
      if (task) {
        const col = columns.find(c => c.name === currentColumn);
        if (col) col.tasks.push(task);
      }
    }
  }

  return {
    squadId,
    sprintName,
    sprintDates,
    velocity,
    epic,
    squadMembers,
    columns,
  };
}
