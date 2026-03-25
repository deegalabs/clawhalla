'use client';

import { useState, useEffect, useCallback, DragEvent } from 'react';

type BoardView = 'kanban' | 'sprints' | 'epics';

interface Epic {
  id: string;
  title: string;
  status: string;
  notes?: string;
}

interface Story {
  id: string;
  epicId?: string;
  epic_id?: string;
  title: string;
  status: string;
  points?: number;
  assignedTo?: string;
  assigned_to?: string;
}

interface Sprint {
  id: string;
  name: string;
  status: string;
  startDate?: string;
  start_date?: string;
  endDate?: string;
  end_date?: string;
  storyIds?: string;
  story_ids?: string;
}

interface Task {
  id: string;
  title: string;
  description?: string;
  status: string;
  priority: string;
  assignedTo?: string;
  assigned_to?: string;
  storyId?: string;
  story_id?: string;
  sprintId?: string;
  sprint_id?: string;
  notes?: string;
  createdAt: string;
  created_at?: string;
  completedAt?: string;
  completed_at?: string;
  source?: string;
}

const columns = [
  { id: 'backlog', label: 'Backlog', color: 'border-t-gray-500', bgHover: 'bg-gray-500/5' },
  { id: 'in_progress', label: 'In Progress', color: 'border-t-blue-500', bgHover: 'bg-blue-500/5' },
  { id: 'review', label: 'Review', color: 'border-t-amber-500', bgHover: 'bg-amber-500/5' },
  { id: 'done', label: 'Done', color: 'border-t-green-500', bgHover: 'bg-green-500/5' },
];

const priorityColors: Record<string, string> = {
  low: 'border-l-gray-600',
  medium: 'border-l-blue-500',
  high: 'border-l-amber-500',
  critical: 'border-l-red-500',
};

const priorityDots: Record<string, string> = {
  low: 'bg-gray-500',
  medium: 'bg-blue-500',
  high: 'bg-amber-500',
  critical: 'bg-red-500',
};

function normalizeTask(t: Task): Task {
  return {
    ...t,
    assignedTo: t.assignedTo || t.assigned_to,
    storyId: t.storyId || t.story_id,
    sprintId: t.sprintId || t.sprint_id,
    createdAt: t.createdAt || t.created_at || new Date().toISOString(),
    completedAt: t.completedAt || t.completed_at,
  };
}

function timeAgo(dateStr?: string): string {
  if (!dateStr) return '';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export default function TasksPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [epicsData, setEpicsData] = useState<Epic[]>([]);
  const [storiesData, setStoriesData] = useState<Story[]>([]);
  const [sprintsData, setSprintsData] = useState<Sprint[]>([]);
  const [view, setView] = useState<BoardView>('kanban');
  const [showModal, setShowModal] = useState(false);
  const [dragOverColumn, setDragOverColumn] = useState<string | null>(null);
  const [newTask, setNewTask] = useState({ title: '', description: '', priority: 'medium', assignedTo: '' });

  const fetchTasks = useCallback(() => {
    fetch('/api/board/sync?project=clawhalla')
      .then(r => r.json())
      .then(data => {
        setTasks((data.tasks || []).map((t: Task) => normalizeTask(t)));
        setEpicsData(data.epics || []);
        setStoriesData(data.stories || []);
        setSprintsData(data.sprints || []);
      })
      .catch(console.error);
  }, []);

  useEffect(() => {
    fetchTasks();
    const interval = setInterval(fetchTasks, 30000);
    return () => clearInterval(interval);
  }, [fetchTasks]);

  // SSE for real-time board updates
  useEffect(() => {
    let es: EventSource | null = null;
    try {
      es = new EventSource('/api/sse');
      es.onmessage = (event) => {
        const data = JSON.parse(event.data);
        if (data.type === 'file_change' && data.event?.path?.includes('board/')) {
          fetchTasks();
        }
      };
    } catch { /* SSE not available */ }
    return () => { if (es) es.close(); };
  }, [fetchTasks]);

  // Drag and drop handlers
  const handleDragStart = (e: DragEvent, taskId: string) => {
    e.dataTransfer.setData('text/plain', taskId);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: DragEvent, columnId: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverColumn(columnId);
  };

  const handleDragLeave = () => {
    setDragOverColumn(null);
  };

  const handleDrop = (e: DragEvent, newStatus: string) => {
    e.preventDefault();
    setDragOverColumn(null);
    const taskId = e.dataTransfer.getData('text/plain');
    if (taskId) {
      handleStatusChange(taskId, newStatus);
    }
  };

  const handleStatusChange = async (taskId: string, newStatus: string) => {
    // Optimistic update
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, status: newStatus } : t));

    try {
      await fetch(`/api/tasks/${taskId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
    } catch {
      fetchTasks(); // Revert on error
    }
  };

  const handleCreateTask = async () => {
    try {
      const res = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newTask),
      });
      await res.json();
      setShowModal(false);
      setNewTask({ title: '', description: '', priority: 'medium', assignedTo: '' });
      fetchTasks();
    } catch (error) {
      console.error('Failed to create task:', error);
    }
  };

  // Stats
  const backlogCount = tasks.filter(t => t.status === 'backlog').length;
  const inProgressCount = tasks.filter(t => t.status === 'in_progress').length;
  const reviewCount = tasks.filter(t => t.status === 'review').length;
  const doneCount = tasks.filter(t => t.status === 'done').length;

  return (
    <div className="space-y-5">
      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-[#111113] rounded-lg p-4 border border-[#1e1e21]">
          <div className="text-[11px] text-gray-500 uppercase tracking-wider">Backlog</div>
          <div className="text-2xl font-bold text-gray-400 mt-1">{backlogCount}</div>
        </div>
        <div className="bg-[#111113] rounded-lg p-4 border border-[#1e1e21]">
          <div className="text-[11px] text-blue-400 uppercase tracking-wider">In Progress</div>
          <div className="text-2xl font-bold text-blue-400 mt-1">{inProgressCount}</div>
        </div>
        <div className="bg-[#111113] rounded-lg p-4 border border-[#1e1e21]">
          <div className="text-[11px] text-amber-400 uppercase tracking-wider">Review</div>
          <div className="text-2xl font-bold text-amber-400 mt-1">{reviewCount}</div>
        </div>
        <div className="bg-[#111113] rounded-lg p-4 border border-[#1e1e21]">
          <div className="text-[11px] text-green-400 uppercase tracking-wider">Done</div>
          <div className="text-2xl font-bold text-green-400 mt-1">{doneCount}</div>
        </div>
      </div>

      {/* Board header + view tabs */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h2 className="text-lg font-semibold text-gray-100">Board</h2>
          <div className="flex gap-1 bg-[#111113] rounded-lg p-0.5 border border-[#1e1e21]">
            {(['kanban', 'sprints', 'epics'] as BoardView[]).map(v => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={`px-3 py-1 text-xs rounded-md capitalize ${
                  view === v ? 'bg-[#1e1e21] text-gray-100' : 'text-gray-500 hover:text-gray-300'
                }`}
              >
                {v}
              </button>
            ))}
          </div>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="px-3 py-1.5 text-xs font-medium bg-amber-500 text-gray-900 rounded hover:bg-amber-400"
        >
          + New Task
        </button>
      </div>

      {/* Sprints view */}
      {view === 'sprints' && (
        <div className="space-y-4">
          {sprintsData.map(sprint => {
            const sprintStoryIds = sprint.storyIds || sprint.story_ids;
            const storyIds: string[] = sprintStoryIds ? (typeof sprintStoryIds === 'string' ? JSON.parse(sprintStoryIds) : sprintStoryIds) : [];
            const sprintTasks = tasks.filter(t => t.sprintId === sprint.id || storyIds.includes(t.storyId || ''));
            const doneCount = sprintTasks.filter(t => t.status === 'done').length;
            const progress = sprintTasks.length > 0 ? Math.round((doneCount / sprintTasks.length) * 100) : 0;

            return (
              <div key={sprint.id} className="bg-[#111113] rounded-lg border border-[#1e1e21] p-5">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h3 className="text-sm font-semibold text-gray-200">{sprint.name}</h3>
                    <div className="text-[11px] text-gray-600 mt-0.5">
                      {sprint.startDate || sprint.start_date} → {sprint.endDate || sprint.end_date}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`text-xs px-2 py-0.5 rounded capitalize ${
                      sprint.status === 'done' ? 'bg-green-500/20 text-green-400' :
                      sprint.status === 'active' ? 'bg-blue-500/20 text-blue-400' :
                      'bg-gray-500/20 text-gray-400'
                    }`}>
                      {sprint.status}
                    </span>
                    <span className="text-xs text-gray-500">{doneCount}/{sprintTasks.length}</span>
                  </div>
                </div>
                <div className="h-1.5 bg-[#1a1a1d] rounded-full overflow-hidden mb-3">
                  <div className="h-full bg-amber-500 rounded-full" style={{ width: `${progress}%` }} />
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  {sprintTasks.map(task => (
                    <div key={task.id} className={`px-3 py-2 rounded border-l-2 ${priorityColors[task.priority] || 'border-l-gray-600'} bg-[#0a0a0b]`}>
                      <div className="text-xs text-gray-300 truncate">{task.title}</div>
                      <div className="flex items-center gap-2 mt-1">
                        <span className={`w-1.5 h-1.5 rounded-full ${task.status === 'done' ? 'bg-green-500' : task.status === 'in_progress' ? 'bg-blue-500' : 'bg-gray-600'}`} />
                        <span className="text-[10px] text-gray-600">{task.assignedTo ? `@${task.assignedTo}` : ''}</span>
                      </div>
                    </div>
                  ))}
                  {sprintTasks.length === 0 && (
                    <div className="col-span-4 text-xs text-gray-700 py-2">No tasks in this sprint</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Epics view */}
      {view === 'epics' && (
        <div className="space-y-4">
          {epicsData.map(epic => {
            const epicStories = storiesData.filter(s => (s.epicId || s.epic_id) === epic.id);
            const epicTasks = tasks.filter(t => epicStories.some(s => s.id === t.storyId));
            const doneStories = epicStories.filter(s => s.status === 'done').length;
            const progress = epicStories.length > 0 ? Math.round((doneStories / epicStories.length) * 100) : 0;

            return (
              <div key={epic.id} className="bg-[#111113] rounded-lg border border-[#1e1e21] p-5">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-gray-200">{epic.title}</h3>
                  <span className={`text-xs px-2 py-0.5 rounded capitalize ${
                    epic.status === 'done' ? 'bg-green-500/20 text-green-400' :
                    epic.status === 'active' ? 'bg-amber-500/20 text-amber-400' :
                    'bg-gray-500/20 text-gray-400'
                  }`}>
                    {epic.status}
                  </span>
                </div>
                {epic.notes && <p className="text-xs text-gray-500 mb-3">{epic.notes}</p>}
                <div className="h-1.5 bg-[#1a1a1d] rounded-full overflow-hidden mb-3">
                  <div className="h-full bg-amber-500 rounded-full" style={{ width: `${progress}%` }} />
                </div>
                <div className="text-[11px] text-gray-600 mb-3">{doneStories}/{epicStories.length} stories • {epicTasks.length} tasks</div>
                <div className="space-y-1.5">
                  {epicStories.map(story => {
                    const storyTasks = tasks.filter(t => t.storyId === story.id);
                    const storyDone = storyTasks.filter(t => t.status === 'done').length;
                    return (
                      <div key={story.id} className="flex items-center gap-3 px-3 py-2 bg-[#0a0a0b] rounded">
                        <span className={`w-2 h-2 rounded-full ${story.status === 'done' ? 'bg-green-500' : 'bg-gray-600'}`} />
                        <span className="text-xs text-gray-300 flex-1 truncate">{story.title}</span>
                        {story.points && <span className="text-[10px] text-gray-600">{story.points}pt</span>}
                        <span className="text-[10px] text-gray-600">{storyDone}/{storyTasks.length}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Kanban columns */}
      {view === 'kanban' && <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {columns.map(column => {
          const columnTasks = tasks.filter(t => t.status === column.id);
          const isDragOver = dragOverColumn === column.id;

          return (
            <div
              key={column.id}
              className={`bg-[#111113] rounded-lg border border-[#1e1e21] border-t-2 ${column.color} min-h-[300px] flex flex-col ${isDragOver ? column.bgHover : ''}`}
              onDragOver={(e) => handleDragOver(e, column.id)}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, column.id)}
            >
              {/* Column header */}
              <div className="px-4 py-3 flex items-center justify-between border-b border-[#1e1e21]">
                <span className="text-sm font-medium text-gray-300">{column.label}</span>
                <span className="text-xs text-gray-600 bg-[#1a1a1d] px-2 py-0.5 rounded">{columnTasks.length}</span>
              </div>

              {/* Cards */}
              <div className="p-2 flex-1 space-y-2 overflow-y-auto">
                {columnTasks.map(task => (
                  <div
                    key={task.id}
                    draggable
                    onDragStart={(e) => handleDragStart(e, task.id)}
                    className={`bg-[#0a0a0b] rounded-lg p-3 border-l-2 ${priorityColors[task.priority] || 'border-l-gray-600'} cursor-grab active:cursor-grabbing hover:bg-[#141416] group`}
                  >
                    <div className="text-sm text-gray-200 font-medium leading-tight">{task.title}</div>
                    {task.assignedTo && (
                      <div className="flex items-center gap-1.5 mt-2">
                        <span className={`w-1.5 h-1.5 rounded-full ${priorityDots[task.priority] || 'bg-gray-500'}`}></span>
                        <span className="text-[11px] text-amber-500">@{task.assignedTo}</span>
                      </div>
                    )}
                    {task.storyId && (
                      <div className="text-[10px] text-gray-600 mt-1">{task.storyId}</div>
                    )}
                    {task.completedAt && (
                      <div className="text-[10px] text-gray-600 mt-1">{timeAgo(task.completedAt)}</div>
                    )}
                    {/* Mobile: Move button */}
                    {column.id !== 'done' && (
                      <button
                        onClick={() => {
                          const next = column.id === 'backlog' ? 'in_progress' : column.id === 'in_progress' ? 'review' : 'done';
                          handleStatusChange(task.id, next);
                        }}
                        className="mt-2 text-[10px] text-gray-600 hover:text-gray-300 md:opacity-0 md:group-hover:opacity-100"
                      >
                        Move →
                      </button>
                    )}
                  </div>
                ))}
                {columnTasks.length === 0 && (
                  <div className="text-xs text-gray-700 text-center py-8">
                    {isDragOver ? 'Drop here' : 'No tasks'}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>}

      {/* Create modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-[#111113] rounded-lg p-5 w-full max-w-md border border-[#1e1e21]">
            <h3 className="text-sm font-semibold text-gray-200 mb-4">New Task</h3>
            <div className="space-y-3">
              <input
                type="text" placeholder="Task title"
                value={newTask.title} onChange={e => setNewTask({ ...newTask, title: e.target.value })}
                className="w-full px-3 py-2 bg-[#0a0a0b] border border-[#1e1e21] rounded text-sm text-gray-200 focus:outline-none focus:border-amber-500"
              />
              <textarea
                placeholder="Description (optional)" rows={3}
                value={newTask.description} onChange={e => setNewTask({ ...newTask, description: e.target.value })}
                className="w-full px-3 py-2 bg-[#0a0a0b] border border-[#1e1e21] rounded text-sm text-gray-200 focus:outline-none focus:border-amber-500 resize-none"
              />
              <div className="grid grid-cols-2 gap-3">
                <select
                  value={newTask.priority} onChange={e => setNewTask({ ...newTask, priority: e.target.value })}
                  className="px-3 py-2 bg-[#0a0a0b] border border-[#1e1e21] rounded text-sm text-gray-200 focus:outline-none focus:border-amber-500"
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="critical">Critical</option>
                </select>
                <input
                  type="text" placeholder="@agent"
                  value={newTask.assignedTo} onChange={e => setNewTask({ ...newTask, assignedTo: e.target.value })}
                  className="px-3 py-2 bg-[#0a0a0b] border border-[#1e1e21] rounded text-sm text-gray-200 focus:outline-none focus:border-amber-500"
                />
              </div>
              <div className="flex gap-2 pt-2">
                <button onClick={handleCreateTask}
                  className="flex-1 px-4 py-2 text-xs font-medium bg-amber-500 text-gray-900 rounded hover:bg-amber-400">
                  Create
                </button>
                <button onClick={() => setShowModal(false)}
                  className="flex-1 px-4 py-2 text-xs font-medium bg-[#1a1a1d] text-gray-400 rounded hover:text-gray-200">
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
