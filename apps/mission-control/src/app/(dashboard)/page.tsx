import { db } from '@/lib/db';
import { tasks, activities } from '@/lib/schema';
import { eq, count, and } from 'drizzle-orm';
import Link from 'next/link';

const orgStructure = [
  { id: 'claw', name: 'Claw', emoji: '🦞', role: 'System Controller', status: 'active' },
  { id: 'odin', name: 'Odin', emoji: '👁️', role: 'CTO', status: 'active' },
  { id: 'vidar', name: 'Vidar', emoji: '⛓️', role: 'Blockchain Architect', status: 'active' },
  { id: 'thor', name: 'Thor', emoji: '⚡', role: 'Tech Lead', status: 'active' },
  { id: 'frigg', name: 'Frigg', emoji: '👑', role: 'Coordinator / PA', status: 'active' },
  { id: 'saga', name: 'Saga', emoji: '📜', role: 'Research Lead (CPO)', status: 'active' },
  { id: 'tyr', name: 'Tyr', emoji: '⚖️', role: 'Security Auditor', status: 'active' },
  { id: 'freya', name: 'Freya', emoji: '✨', role: 'Senior Developer', status: 'active' },
  { id: 'heimdall', name: 'Heimdall', emoji: '👁️‍🗨️', role: 'QA / Observability', status: 'active' },
  { id: 'volund', name: 'Völund', emoji: '🔨', role: 'Developer / GitHub', status: 'active' },
  { id: 'sindri', name: 'Sindri', emoji: '🔥', role: 'Solidity Developer', status: 'active' },
  { id: 'skadi', name: 'Skadi', emoji: '❄️', role: 'Cairo Developer', status: 'active' },
  { id: 'mimir', name: 'Mimir', emoji: '🧠', role: 'Knowledge Curator', status: 'active' },
  { id: 'bragi', name: 'Bragi', emoji: '🎭', role: 'Content Creator', status: 'active' },
  { id: 'loki', name: 'Loki', emoji: '🎲', role: 'Monitor / Analytics', status: 'active' },
];

export default async function DashboardPage() {
  const activeTasks = await db.select({ count: count() })
    .from(tasks)
    .where(eq(tasks.status, 'in_progress'));

  const doneTasks = await db.select({ count: count() })
    .from(tasks)
    .where(eq(tasks.status, 'done'));

  const completedThisWeek = await db.select({ count: count() })
    .from(tasks)
    .where(and(
      eq(tasks.status, 'done'),
      // Simple week filter - in production would use proper date range
    ));

  const totalTasks = await db.select({ count: count() }).from(tasks);

  const recentActivities = await db.select()
    .from(activities)
    .orderBy(activities.timestamp)
    .limit(10);

  const activeCount = activeTasks[0]?.count || 0;
  const doneCount = doneTasks[0]?.count || 0;
  const total = totalTasks[0]?.count || 0;
  const completionRate = total === 0 ? 0 : Math.round((doneCount / total) * 100);

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-gray-900 rounded-lg p-6 border border-gray-800">
          <div className="text-sm text-gray-400 mb-2">Active Agents</div>
          <div className="text-3xl font-bold text-amber-500">15</div>
        </div>
        <div className="bg-gray-900 rounded-lg p-6 border border-gray-800">
          <div className="text-sm text-gray-400 mb-2">Active Tasks</div>
          <div className="text-3xl font-bold text-blue-500">{activeCount}</div>
        </div>
        <div className="bg-gray-900 rounded-lg p-6 border border-gray-800">
          <div className="text-sm text-gray-400 mb-2">Completion Rate</div>
          <div className="text-3xl font-bold text-green-500">{completionRate}%</div>
        </div>
        <div className="bg-gray-900 rounded-lg p-6 border border-gray-800">
          <div className="text-sm text-gray-400 mb-2">This Week</div>
          <div className="text-3xl font-bold text-purple-500">{completedThisWeek[0]?.count || 0}</div>
        </div>
      </div>

      {/* Agent Grid */}
      <div className="bg-gray-900 rounded-lg p-6 border border-gray-800">
        <h3 className="text-xl font-semibold text-gray-100 mb-4">Organization</h3>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
          {orgStructure.map((agent) => (
            <div key={agent.id} className="bg-gray-800 rounded-lg p-4 border border-gray-700 hover:border-amber-500 transition-colors">
              <div className="text-3xl mb-2">{agent.emoji}</div>
              <div className="text-sm font-semibold text-gray-100">{agent.name}</div>
              <div className="text-xs text-gray-400 mt-1">{agent.role}</div>
              <div className="mt-2">
                <span className="inline-block px-2 py-1 bg-green-500/10 text-green-500 text-xs rounded">
                  {agent.status}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Activity Feed */}
        <div className="bg-gray-900 rounded-lg p-6 border border-gray-800">
          <h3 className="text-xl font-semibold text-gray-100 mb-4">Recent Activity</h3>
          <div className="space-y-3">
            {recentActivities.length === 0 ? (
              <p className="text-gray-500 text-sm">No recent activity</p>
            ) : (
              recentActivities.map((activity) => (
                <div key={activity.id} className="flex items-start gap-3 text-sm">
                  <div className="text-gray-400 w-16 flex-shrink-0">
                    {new Date(activity.timestamp).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                  </div>
                  <div>
                    <span className="text-amber-500 font-medium">{activity.agentId}</span>
                    <span className="text-gray-400"> {activity.action} </span>
                    {activity.target && <span className="text-gray-300">{activity.target}</span>}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Quick Actions */}
        <div className="bg-gray-900 rounded-lg p-6 border border-gray-800">
          <h3 className="text-xl font-semibold text-gray-100 mb-4">Quick Actions</h3>
          <div className="space-y-3">
            <Link href="/tasks" className="block p-4 bg-gray-800 hover:bg-gray-750 rounded-lg border border-gray-700 hover:border-amber-500 transition-colors">
              <div className="flex items-center gap-3">
                <span className="text-2xl">✓</span>
                <div>
                  <div className="font-semibold text-gray-100">View Tasks</div>
                  <div className="text-sm text-gray-400">Kanban board and assignments</div>
                </div>
              </div>
            </Link>
            <Link href="/approvals" className="block p-4 bg-gray-800 hover:bg-gray-750 rounded-lg border border-gray-700 hover:border-amber-500 transition-colors">
              <div className="flex items-center gap-3">
                <span className="text-2xl">✋</span>
                <div>
                  <div className="font-semibold text-gray-100">Pending Approvals</div>
                  <div className="text-sm text-gray-400">Review and approve requests</div>
                </div>
              </div>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
