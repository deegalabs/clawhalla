'use client';

import { useState, useEffect, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { MarkdownView } from '@/components/ui/markdown-view';
import { autoTask } from '@/lib/tasks';
import { AGENT_ROSTER } from '@/lib/agents';

interface Goal {
  id: string;
  title: string;
  description: string;
  priority: 'critical' | 'high' | 'medium' | 'low';
  status: 'active' | 'achieved' | 'paused';
  createdAt: string;
}

interface AutopilotRun {
  id: string;
  timestamp: string;
  goalId: string | null;
  taskTitle: string;
  taskDescription: string;
  agentId: string;
  status: 'pending' | 'running' | 'done' | 'failed' | 'rejected';
  result?: string;
  feedback?: 'approved' | 'rejected' | 'adjusted';
  feedbackNote?: string;
}

interface CronJob {
  name: string;
  schedule: string;
  enabled: boolean;
  lastRun?: string;
  nextRun?: string;
}


const priorityColors = {
  critical: 'bg-red-500/20 text-red-400 border-red-500/20',
  high: 'bg-amber-500/20 text-amber-400 border-amber-500/20',
  medium: 'bg-blue-500/20 text-blue-400 border-blue-500/20',
  low: 'bg-gray-500/20 text-gray-400 border-gray-500/20',
};

// DB-backed persistence via API
async function fetchGoals(): Promise<Goal[]> {
  try {
    const res = await fetch('/api/autopilot/goals');
    const data = await res.json();
    if (data.ok && data.goals) {
      return data.goals.map((g: Record<string, unknown>) => ({
        id: g.id,
        title: g.title,
        description: g.description || '',
        priority: g.priority || 'high',
        status: g.status || 'active',
        createdAt: g.createdAt ? new Date(g.createdAt as number).toISOString() : new Date().toISOString(),
      }));
    }
  } catch { /* ignore */ }
  return [];
}

async function fetchRuns(): Promise<AutopilotRun[]> {
  try {
    const res = await fetch('/api/autopilot/runs');
    const data = await res.json();
    if (data.ok && data.runs) {
      return data.runs.map((r: Record<string, unknown>) => ({
        id: r.id,
        timestamp: r.createdAt ? new Date(r.createdAt as number).toISOString() : new Date().toISOString(),
        goalId: r.goalId || null,
        taskTitle: r.taskTitle || '',
        taskDescription: r.taskDescription || '',
        agentId: r.agentId || 'main',
        status: r.status || 'pending',
        result: r.result || undefined,
        feedback: r.feedback || undefined,
        feedbackNote: r.feedbackNote || undefined,
      }));
    }
  } catch { /* ignore */ }
  return [];
}

async function saveGoalToDB(goal: Goal) {
  await fetch('/api/autopilot/goals', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      id: goal.id, title: goal.title, description: goal.description,
      priority: goal.priority, status: goal.status,
    }),
  }).catch(() => {});
}

async function deleteGoalFromDB(id: string) {
  await fetch(`/api/autopilot/goals?id=${id}`, { method: 'DELETE' }).catch(() => {});
}

async function saveRunToDB(run: AutopilotRun) {
  await fetch('/api/autopilot/runs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      id: run.id, goalId: run.goalId, agentId: run.agentId,
      taskTitle: run.taskTitle, taskDescription: run.taskDescription,
      status: run.status, result: run.result,
      feedback: run.feedback, feedbackNote: run.feedbackNote,
    }),
  }).catch(() => {});
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function AutopilotPageInner() {
  const [goals, setGoals] = useState<Goal[]>([]);
  const [runs, setRuns] = useState<AutopilotRun[]>([]);
  const [crons, setCrons] = useState<CronJob[]>([]);
  const [showGoalForm, setShowGoalForm] = useState(false);
  const [goalForm, setGoalForm] = useState({ title: '', description: '', priority: 'high' as Goal['priority'] });
  const [autopilotAgent, setAutopilotAgent] = useState('main');
  const [autopilotSchedule, setAutopilotSchedule] = useState('0 2 * * *');
  const [running, setRunning] = useState(false);
  const [editingGoal, setEditingGoal] = useState<string | null>(null);
  const [feedbackRunId, setFeedbackRunId] = useState<string | null>(null);
  const [feedbackNote, setFeedbackNote] = useState('');

  useEffect(() => {
    fetchGoals().then(g => setGoals(g));
    fetchRuns().then(r => setRuns(r));
  }, []);

  // Fetch crons
  const fetchCrons = useCallback(async () => {
    try {
      const res = await fetch('/api/crons');
      const data = await res.json();
      if (data.ok && data.jobs) setCrons(data.jobs);
    } catch (err) { console.error('[autopilot] fetch error:', err); }
  }, []);
  useEffect(() => { fetchCrons(); }, [fetchCrons]);

  const autopilotCron = crons.find(c => c.name?.toLowerCase().includes('autopilot'));

  // Save goal
  const handleSaveGoal = () => {
    if (!goalForm.title.trim()) return;
    if (editingGoal) {
      const updatedGoal = { ...goals.find(g => g.id === editingGoal)!, ...goalForm };
      const updated = goals.map(g => g.id === editingGoal ? updatedGoal : g);
      setGoals(updated);
      saveGoalToDB(updatedGoal);
      setEditingGoal(null);
    } else {
      const goal: Goal = {
        id: `goal_${Date.now().toString(36)}`,
        ...goalForm,
        status: 'active',
        createdAt: new Date().toISOString(),
      };
      setGoals([goal, ...goals]);
      saveGoalToDB(goal);
    }
    setGoalForm({ title: '', description: '', priority: 'high' });
    setShowGoalForm(false);
  };

  const handleDeleteGoal = (id: string) => {
    setGoals(goals.filter(g => g.id !== id));
    deleteGoalFromDB(id);
  };

  const handleToggleGoal = (id: string) => {
    const goal = goals.find(g => g.id === id);
    if (!goal) return;
    const newStatus = goal.status === 'active' ? 'paused' as const : 'active' as const;
    const updated = goals.map(g => g.id === id ? { ...g, status: newStatus } : g);
    setGoals(updated);
    saveGoalToDB({ ...goal, status: newStatus });
  };

  // Run autopilot NOW
  const handleRunNow = async () => {
    const activeGoals = goals.filter(g => g.status === 'active');
    if (activeGoals.length === 0) return;

    setRunning(true);
    const runId = `run_${Date.now().toString(36)}`;
    const newRun: AutopilotRun = {
      id: runId,
      timestamp: new Date().toISOString(),
      goalId: null, taskTitle: '', taskDescription: '',
      agentId: autopilotAgent, status: 'running',
    };
    const updatedRuns = [newRun, ...runs];
    setRuns(updatedRuns);
    saveRunToDB(newRun);

    try {
      const goalsText = activeGoals.map((g, i) => `${i + 1}. [${g.priority.toUpperCase()}] ${g.title}: ${g.description}`).join('\n');

      const prompt = `You are a proactive autonomous employee. Review my business goals and current state, then pick ONE task that will bring us 1 step closer to our goals. Every task should create real progress.

BUSINESS GOALS:
${goalsText}

Instructions:
1. Analyze which goal needs the most attention right now
2. Pick ONE concrete, actionable task you can do right now
3. Do the task
4. Report what you did

Format your response as:
GOAL: [which goal this advances]
TASK: [what you did - one line]
DETAILS: [what was accomplished, what changed, what's next]`;

      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentId: autopilotAgent, message: prompt }),
      });
      const data = await res.json();

      if (data.ok && data.response) {
        // Parse response
        const goalMatch = data.response.match(/GOAL:\s*(.+)/i);
        const taskMatch = data.response.match(/TASK:\s*(.+)/i);

        const completedRun: AutopilotRun = {
          ...newRun,
          status: 'done',
          taskTitle: taskMatch?.[1]?.trim() || 'Autonomous task completed',
          taskDescription: data.response,
          result: data.response,
          goalId: activeGoals[0]?.id || null,
        };

        // Create task in board
        await autoTask.autopilotRun(
          goalMatch?.[1]?.trim() || 'General',
          completedRun.taskTitle
        );

        const finalRuns = [completedRun, ...runs];
        setRuns(finalRuns);
        saveRunToDB(completedRun);
      } else {
        const failedRun: AutopilotRun = { ...newRun, status: 'failed', result: data.error || 'Failed' };
        const finalRuns = [failedRun, ...runs];
        setRuns(finalRuns);
        saveRunToDB(failedRun);
      }
    } catch (err) {
      const failedRun: AutopilotRun = { ...newRun, status: 'failed', result: String(err) };
      const finalRuns = [failedRun, ...runs];
      setRuns(finalRuns);
      saveRunToDB(failedRun);
    }
    setRunning(false);
  };

  // Feedback on a run
  const handleFeedback = (runId: string, type: 'approved' | 'rejected' | 'adjusted') => {
    const run = runs.find(r => r.id === runId);
    const updatedRun = { ...run!, feedback: type, feedbackNote: feedbackNote || undefined };
    const updated = runs.map(r => r.id === runId ? updatedRun : r);
    setRuns(updated);
    saveRunToDB(updatedRun);
    setFeedbackRunId(null);
    setFeedbackNote('');
  };

  const activeGoals = goals.filter(g => g.status === 'active');
  const completedRuns = runs.filter(r => r.status === 'done');
  const approvedRuns = runs.filter(r => r.feedback === 'approved');

  return (
    <div className="flex flex-col h-[calc(100vh-7rem)] gap-3">
      {/* Header */}
      <div className="flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-semibold text-gray-200">Autopilot</h2>
          <span className="text-[10px] text-gray-600">
            {activeGoals.length} goals • {completedRuns.length} runs • {approvedRuns.length} approved
          </span>
        </div>
        <div className="flex items-center gap-2">
          {/* Autopilot status */}
          <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] border ${
            autopilotCron?.enabled ? 'bg-green-500/10 border-green-500/20 text-green-400' : 'bg-[#111113] border-[#1e1e21] text-gray-500'
          }`}>
            <span className={`w-1.5 h-1.5 rounded-full ${autopilotCron?.enabled ? 'bg-green-500 animate-pulse' : 'bg-gray-600'}`} />
            {autopilotCron?.enabled ? `Active • ${autopilotCron.schedule}` : 'Not scheduled'}
          </div>
          {/* Run now */}
          <button onClick={handleRunNow} disabled={running || activeGoals.length === 0}
            className="px-3 py-1.5 text-[10px] font-medium bg-amber-500 text-gray-900 rounded hover:bg-amber-400 disabled:opacity-40">
            {running ? 'Running...' : '▶ Run Now'}
          </button>
        </div>
      </div>

      {/* Main layout */}
      <div className="flex gap-3 flex-1 min-h-0">
        {/* Left: Goals + Config */}
        <div className="w-80 flex flex-col gap-3 shrink-0 min-h-0">
          {/* Prompt display */}
          <div className="bg-[#111113] rounded-lg border border-[#1e1e21] p-3 shrink-0">
            <div className="text-[9px] text-gray-500 uppercase tracking-wider mb-2 font-medium">Autopilot Prompt</div>
            <div className="text-[10px] text-gray-400 leading-relaxed italic bg-[#0a0a0b] rounded p-2.5 border border-[#1e1e21]">
              &quot;Every run, look at my goals, what we&apos;ve done, and do 1 task that brings us closer. Every task = 1 step forward.&quot;
            </div>
            <div className="grid grid-cols-2 gap-2 mt-2">
              <div>
                <label className="block text-[8px] text-gray-600 mb-0.5">Agent</label>
                <select value={autopilotAgent} onChange={e => setAutopilotAgent(e.target.value)}
                  className="w-full px-2 py-1 bg-[#0a0a0b] border border-[#1e1e21] rounded text-[10px] text-gray-200 focus:outline-none">
                  {AGENT_ROSTER.map(a => <option key={a.id} value={a.id}>{a.emoji} {a.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-[8px] text-gray-600 mb-0.5">Schedule</label>
                <select value={autopilotSchedule} onChange={e => setAutopilotSchedule(e.target.value)}
                  className="w-full px-2 py-1 bg-[#0a0a0b] border border-[#1e1e21] rounded text-[10px] text-gray-200 focus:outline-none">
                  <option value="0 2 * * *">Every day 2am</option>
                  <option value="0 8 * * *">Every day 8am</option>
                  <option value="0 */6 * * *">Every 6 hours</option>
                  <option value="0 */12 * * *">Every 12 hours</option>
                  <option value="0 2 * * 1">Weekly (Mon 2am)</option>
                </select>
              </div>
            </div>
          </div>

          {/* Goals */}
          <div className="bg-[#111113] rounded-lg border border-[#1e1e21] flex flex-col flex-1 overflow-hidden min-h-0">
            <div className="px-3 py-2 border-b border-[#1e1e21] flex items-center justify-between shrink-0">
              <div className="text-[10px] text-gray-500 uppercase tracking-wider font-medium">Goals ({activeGoals.length} active)</div>
              <button onClick={() => { setShowGoalForm(!showGoalForm); setEditingGoal(null); setGoalForm({ title: '', description: '', priority: 'high' }); }}
                className="text-[10px] text-amber-400 hover:text-amber-300">
                {showGoalForm ? '✕' : '+ Add'}
              </button>
            </div>

            {/* Goal form */}
            {showGoalForm && (
              <div className="p-3 border-b border-[#1e1e21] shrink-0 space-y-2">
                <input type="text" placeholder="Goal title..." value={goalForm.title}
                  onChange={e => setGoalForm({ ...goalForm, title: e.target.value })}
                  className="w-full px-2.5 py-1.5 bg-[#0a0a0b] border border-[#1e1e21] rounded text-[11px] text-gray-200 placeholder-gray-600 focus:outline-none focus:border-amber-500" />
                <textarea placeholder="Description — what does success look like?" rows={2} value={goalForm.description}
                  onChange={e => setGoalForm({ ...goalForm, description: e.target.value })}
                  className="w-full px-2.5 py-1.5 bg-[#0a0a0b] border border-[#1e1e21] rounded text-[10px] text-gray-200 placeholder-gray-600 focus:outline-none focus:border-amber-500 resize-none" />
                <div className="flex gap-1">
                  {(['critical', 'high', 'medium', 'low'] as const).map(p => (
                    <button key={p} onClick={() => setGoalForm({ ...goalForm, priority: p })}
                      className={`flex-1 py-1 text-[9px] rounded capitalize border ${goalForm.priority === p ? priorityColors[p] : 'bg-[#0a0a0b] border-[#1e1e21] text-gray-600'}`}>
                      {p}
                    </button>
                  ))}
                </div>
                <button onClick={handleSaveGoal} disabled={!goalForm.title.trim()}
                  className="w-full py-1.5 text-[10px] font-medium bg-amber-500 text-gray-900 rounded hover:bg-amber-400 disabled:opacity-40">
                  {editingGoal ? 'Update Goal' : 'Add Goal'}
                </button>
              </div>
            )}

            {/* Goals list */}
            <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
              {goals.length === 0 ? (
                <div className="text-center py-6">
                  <div className="text-xl mb-1">🎯</div>
                  <div className="text-[10px] text-gray-600">Add goals for the autopilot to work toward</div>
                </div>
              ) : (
                goals.map(goal => (
                  <div key={goal.id} className={`p-2.5 rounded-lg border group transition-colors ${
                    goal.status === 'active' ? 'border-[#1e1e21] bg-[#0a0a0b]' : 'border-[#1a1a1d] bg-[#0a0a0b] opacity-50'
                  }`}>
                    <div className="flex items-start gap-2">
                      <button onClick={() => handleToggleGoal(goal.id)}
                        className={`w-4 h-4 rounded border mt-0.5 shrink-0 flex items-center justify-center text-[8px] ${
                          goal.status === 'active' ? 'border-amber-500/40 text-amber-500' : 'border-gray-600 text-gray-600'
                        }`}>
                        {goal.status === 'active' ? '●' : '○'}
                      </button>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-[11px] font-medium text-gray-200">{goal.title}</span>
                          <span className={`text-[8px] px-1 py-0.5 rounded border ${priorityColors[goal.priority]}`}>{goal.priority}</span>
                        </div>
                        {goal.description && <p className="text-[9px] text-gray-500 mt-0.5 line-clamp-2">{goal.description}</p>}
                      </div>
                      <div className="flex gap-1 opacity-0 group-hover:opacity-100 shrink-0">
                        <button onClick={() => { setEditingGoal(goal.id); setGoalForm({ title: goal.title, description: goal.description, priority: goal.priority }); setShowGoalForm(true); }}
                          className="text-[9px] text-gray-600 hover:text-gray-300">✎</button>
                        <button onClick={() => handleDeleteGoal(goal.id)}
                          className="text-[9px] text-gray-600 hover:text-red-400">×</button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Right: Run history */}
        <div className="flex-1 overflow-y-auto min-h-0">
          <div className="text-[9px] text-gray-500 uppercase tracking-wider mb-2 font-medium">
            Run History ({runs.length})
          </div>

          {runs.length === 0 ? (
            <div className="bg-[#111113] rounded-lg border border-[#1e1e21] p-8 text-center">
              <div className="text-3xl mb-2">🤖</div>
              <div className="text-sm text-gray-400">No autopilot runs yet</div>
              <div className="text-[10px] text-gray-600 mt-1 max-w-sm mx-auto">
                Add goals and click &quot;Run Now&quot; to let the agent proactively work toward your objectives, or set a schedule for automatic runs.
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              {runs.map(run => {
                const agent = AGENT_ROSTER.find(a => a.id === run.agentId);
                const goal = goals.find(g => g.id === run.goalId);
                return (
                  <div key={run.id} className={`bg-[#111113] rounded-lg border p-4 transition-colors ${
                    run.status === 'running' ? 'border-amber-500/30 bg-amber-500/5' :
                    run.feedback === 'approved' ? 'border-green-500/20' :
                    run.feedback === 'rejected' ? 'border-red-500/20' :
                    'border-[#1e1e21]'
                  }`}>
                    {/* Run header */}
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-lg">{agent?.emoji || '🤖'}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-[11px] font-medium text-gray-200">
                            {run.taskTitle || 'Running...'}
                          </span>
                          <span className={`text-[8px] px-1.5 py-0.5 rounded ${
                            run.status === 'done' ? 'bg-green-500/20 text-green-400' :
                            run.status === 'running' ? 'bg-amber-500/20 text-amber-400 animate-pulse' :
                            run.status === 'failed' ? 'bg-red-500/20 text-red-400' :
                            'bg-gray-500/20 text-gray-400'
                          }`}>
                            {run.status}
                          </span>
                          {run.feedback && (
                            <span className={`text-[8px] px-1.5 py-0.5 rounded ${
                              run.feedback === 'approved' ? 'bg-green-500/20 text-green-400' :
                              run.feedback === 'rejected' ? 'bg-red-500/20 text-red-400' :
                              'bg-amber-500/20 text-amber-400'
                            }`}>
                              {run.feedback === 'approved' ? '✓ Approved' : run.feedback === 'rejected' ? '✕ Rejected' : '✎ Adjusted'}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 text-[9px] text-gray-600">
                          <span>{timeAgo(run.timestamp)}</span>
                          {goal && <span>→ {goal.title}</span>}
                        </div>
                      </div>
                    </div>

                    {/* Running animation */}
                    {run.status === 'running' && (
                      <div className="flex items-center gap-2 py-2">
                        <span className="flex gap-1">
                          <span className="w-1.5 h-1.5 bg-amber-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                          <span className="w-1.5 h-1.5 bg-amber-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                          <span className="w-1.5 h-1.5 bg-amber-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                        </span>
                        <span className="text-[10px] text-amber-400">Agent analyzing goals and executing task...</span>
                      </div>
                    )}

                    {/* Result */}
                    {run.result && run.status !== 'running' && (
                      <div className="bg-[#0a0a0b] rounded-lg border border-[#1e1e21] p-3 mt-2">
                        <MarkdownView content={run.result} maxHeight="max-h-40" />
                      </div>
                    )}

                    {/* Feedback note */}
                    {run.feedbackNote && (
                      <div className="mt-2 text-[10px] text-gray-500 italic">Your note: {run.feedbackNote}</div>
                    )}

                    {/* Feedback buttons */}
                    {run.status === 'done' && !run.feedback && (
                      <div className="mt-3 flex items-center gap-2">
                        <span className="text-[9px] text-gray-600">Was this useful?</span>
                        <button onClick={() => handleFeedback(run.id, 'approved')}
                          className="text-[9px] px-2.5 py-1 bg-green-500/10 text-green-400 border border-green-500/20 rounded hover:bg-green-500/20">
                          ✓ Good
                        </button>
                        <button onClick={() => setFeedbackRunId(feedbackRunId === run.id ? null : run.id)}
                          className="text-[9px] px-2.5 py-1 bg-amber-500/10 text-amber-400 border border-amber-500/20 rounded hover:bg-amber-500/20">
                          ✎ Adjust
                        </button>
                        <button onClick={() => handleFeedback(run.id, 'rejected')}
                          className="text-[9px] px-2.5 py-1 bg-red-500/10 text-red-400 border border-red-500/20 rounded hover:bg-red-500/20">
                          ✕ Not useful
                        </button>
                      </div>
                    )}

                    {/* Feedback note input */}
                    {feedbackRunId === run.id && (
                      <div className="mt-2 flex gap-2">
                        <input type="text" placeholder="What should be different next time?" value={feedbackNote}
                          onChange={e => setFeedbackNote(e.target.value)}
                          onKeyDown={e => { if (e.key === 'Enter') handleFeedback(run.id, 'adjusted'); }}
                          className="flex-1 px-2.5 py-1.5 bg-[#0a0a0b] border border-[#1e1e21] rounded text-[10px] text-gray-200 placeholder-gray-600 focus:outline-none focus:border-amber-500" />
                        <button onClick={() => handleFeedback(run.id, 'adjusted')}
                          className="px-3 py-1.5 text-[9px] font-medium bg-amber-500 text-gray-900 rounded hover:bg-amber-400">
                          Save
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default dynamic(() => Promise.resolve(AutopilotPageInner), { ssr: false });
