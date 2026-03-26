// Auto-task utility: creates a task for every agent interaction
// Call this from any page that interacts with agents

export async function createAutoTask(params: {
  title: string;
  assignedTo?: string;
  status?: string;
  priority?: string;
  notes?: string;
  source?: string; // which page/feature created this
}): Promise<string | null> {
  try {
    const res = await fetch('/api/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: params.title,
        status: params.status || 'done',
        priority: params.priority || 'low',
        assignedTo: params.assignedTo || 'main',
        notes: params.notes
          ? `${params.notes}${params.source ? `\n\nSource: ${params.source}` : ''}`
          : params.source ? `Source: ${params.source}` : undefined,
      }),
    });
    const data = await res.json();
    return data.id || data.task?.id || null;
  } catch {
    return null;
  }
}

// Pre-built task creators for common actions
export const autoTask = {
  agentChat: (agentId: string, message: string) =>
    createAutoTask({
      title: `Chat with ${agentId}: ${message.slice(0, 50)}${message.length > 50 ? '...' : ''}`,
      assignedTo: agentId,
      source: 'Chat',
    }),

  agentAction: (agentId: string, action: string, detail?: string) =>
    createAutoTask({
      title: `${action}`,
      assignedTo: agentId,
      notes: detail,
      source: 'Agent Action',
    }),

  contentPublish: (platform: string, text: string) =>
    createAutoTask({
      title: `Published to ${platform}: ${text.slice(0, 50)}...`,
      assignedTo: 'bragi',
      source: 'Content Studio',
    }),

  contentPipeline: (topic: string, platform: string) =>
    createAutoTask({
      title: `Pipeline: ${topic} → ${platform}`,
      assignedTo: 'bragi',
      source: 'Content Pipeline',
    }),

  councilSession: (topic: string) =>
    createAutoTask({
      title: `Council session: ${topic.slice(0, 60)}`,
      assignedTo: 'saga',
      source: 'Council',
    }),

  cronAction: (action: string, cronName: string) =>
    createAutoTask({
      title: `Cron ${action}: ${cronName}`,
      assignedTo: 'main',
      source: 'Calendar',
    }),

  approvalAction: (action: string, detail: string) =>
    createAutoTask({
      title: `${action}: ${detail.slice(0, 60)}`,
      assignedTo: 'main',
      source: 'Approvals',
    }),

  agentCreated: (name: string, role: string) =>
    createAutoTask({
      title: `Created agent: ${name} (${role})`,
      assignedTo: 'main',
      source: 'Team / Factory',
    }),

  packInstalled: (packName: string, agentCount: number) =>
    createAutoTask({
      title: `Installed pack: ${packName} (${agentCount} agents)`,
      assignedTo: 'main',
      source: 'Marketplace',
    }),

  autopilotRun: (goal: string, task: string) =>
    createAutoTask({
      title: `[Autopilot] ${task.slice(0, 60)}`,
      assignedTo: 'main',
      notes: `Goal: ${goal}`,
      source: 'Autopilot',
    }),

  secretAdded: (name: string) =>
    createAutoTask({
      title: `Added secret: ${name}`,
      assignedTo: 'main',
      priority: 'low',
      source: 'Settings / Vault',
    }),

  projectAction: (action: string, projectName: string) =>
    createAutoTask({
      title: `${action}: ${projectName}`,
      assignedTo: 'main',
      source: 'Projects',
    }),
};
