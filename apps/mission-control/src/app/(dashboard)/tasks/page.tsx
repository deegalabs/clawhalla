'use client';

import { useState, useEffect } from 'react';

interface Task {
  id: string;
  title: string;
  description?: string;
  status: string;
  priority: string;
  assignedTo?: string;
  createdAt: string;
  source?: 'mc' | 'workspace';
  story?: string;
}

const columns = [
  { id: 'backlog', label: 'Backlog', color: 'gray' },
  { id: 'in_progress', label: 'In Progress', color: 'blue' },
  { id: 'review', label: 'Review', color: 'amber' },
  { id: 'done', label: 'Done', color: 'green' }
];

const priorityColors = {
  low: 'border-gray-600',
  medium: 'border-blue-500',
  high: 'border-amber-500',
  critical: 'border-red-500'
};

export default function TasksPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [newTask, setNewTask] = useState({ title: '', description: '', priority: 'medium', assignedTo: '' });

  useEffect(() => {
    Promise.all([
      fetch('/api/tasks').then(r => r.json()),
      fetch('/api/board/sync?project=clawhalla').then(r => r.json())
    ])
      .then(([mcTasks, yamlData]) => {
        const mcTasksNormalized = mcTasks.map((t: Task) => ({ ...t, source: 'mc' }));
        const yamlTasks = (yamlData.tasks || []).map((t: any) => ({
          id: t.id,
          title: t.title,
          description: t.description,
          status: t.status || 'backlog',
          assignedTo: t.assigned_to,
          priority: t.priority || 'medium',
          createdAt: t.created_at || new Date().toISOString(),
          source: 'workspace',
          story: t.story,
        }));
        
        // Merge (workspace tasks override MC if same ID)
        const allTasks = [...yamlTasks, ...mcTasksNormalized.filter(
          (mt: Task) => !yamlTasks.find((yt: Task) => yt.id === mt.id)
        )];
        
        setTasks(allTasks);
      })
      .catch(console.error);
  }, []);

  const handleCreateTask = async () => {
    try {
      const res = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newTask)
      });
      const created = await res.json();
      setTasks([...tasks, created]);
      setShowModal(false);
      setNewTask({ title: '', description: '', priority: 'medium', assignedTo: '' });
    } catch (error) {
      console.error('Failed to create task:', error);
    }
  };

  const handleStatusChange = async (taskId: string, newStatus: string) => {
    try {
      await fetch(`/api/tasks/${taskId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus })
      });
      setTasks(tasks.map((t) => (t.id === taskId ? { ...t, status: newStatus } : t)));
    } catch (error) {
      console.error('Failed to update task:', error);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-100">Task Board</h2>
        <button
          onClick={() => setShowModal(true)}
          className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-gray-900 font-medium rounded-lg transition-colors"
        >
          + New Task
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {columns.map((column) => (
          <div key={column.id} className="bg-gray-900 rounded-lg p-4 border border-gray-800">
            <h3 className="text-lg font-semibold text-gray-100 mb-4">{column.label}</h3>
            <div className="space-y-3">
              {tasks
                .filter((task) => task.status === column.id)
                .map((task) => (
                  <div
                    key={task.id}
                    className={`bg-gray-800 rounded-lg p-4 border-l-4 ${priorityColors[task.priority as keyof typeof priorityColors]} cursor-pointer hover:bg-gray-750 transition-colors`}
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div className="font-semibold text-gray-100">{task.title}</div>
                      <span className={`text-xs px-2 py-0.5 rounded ${task.source === 'workspace' ? 'bg-green-900 text-green-300' : 'bg-blue-900 text-blue-300'}`}>
                        {task.source === 'workspace' ? 'YAML' : 'MC'}
                      </span>
                    </div>
                    {task.description && (
                      <p className="text-sm text-gray-400 mb-2 line-clamp-2">{task.description}</p>
                    )}
                    {task.assignedTo && (
                      <div className="text-xs text-amber-500">@{task.assignedTo}</div>
                    )}
                    <div className="mt-3 flex gap-2">
                      {column.id !== 'done' && (
                        <button
                          onClick={() => {
                            const nextStatus = column.id === 'backlog' ? 'in_progress' : column.id === 'in_progress' ? 'review' : 'done';
                            handleStatusChange(task.id, nextStatus);
                          }}
                          className="text-xs px-2 py-1 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded"
                        >
                          Move →
                        </button>
                      )}
                    </div>
                  </div>
                ))}
            </div>
          </div>
        ))}
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-gray-900 rounded-lg p-6 w-full max-w-md border border-gray-800">
            <h3 className="text-xl font-bold text-gray-100 mb-4">Create New Task</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-2">Title</label>
                <input
                  type="text"
                  value={newTask.title}
                  onChange={(e) => setNewTask({ ...newTask, title: e.target.value })}
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-gray-100 focus:border-amber-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-2">Description</label>
                <textarea
                  value={newTask.description}
                  onChange={(e) => setNewTask({ ...newTask, description: e.target.value })}
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-gray-100 focus:border-amber-500 focus:outline-none"
                  rows={3}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-2">Priority</label>
                <select
                  value={newTask.priority}
                  onChange={(e) => setNewTask({ ...newTask, priority: e.target.value })}
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-gray-100 focus:border-amber-500 focus:outline-none"
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="critical">Critical</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-2">Assign To</label>
                <input
                  type="text"
                  value={newTask.assignedTo}
                  onChange={(e) => setNewTask({ ...newTask, assignedTo: e.target.value })}
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-gray-100 focus:border-amber-500 focus:outline-none"
                  placeholder="Agent ID (e.g., thor)"
                />
              </div>
              <div className="flex gap-3 mt-6">
                <button
                  onClick={handleCreateTask}
                  className="flex-1 px-4 py-2 bg-amber-500 hover:bg-amber-600 text-gray-900 font-medium rounded-lg transition-colors"
                >
                  Create
                </button>
                <button
                  onClick={() => setShowModal(false)}
                  className="flex-1 px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 font-medium rounded-lg transition-colors"
                >
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
