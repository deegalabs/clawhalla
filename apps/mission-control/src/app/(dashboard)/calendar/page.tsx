'use client';

import { useState, useEffect } from 'react';

interface CronJob {
  id: string;
  name: string;
  agentId: string;
  schedule: {
    kind: string;
    expr: string;
    tz?: string;
  };
  enabled: boolean;
  state?: {
    nextRunAtMs?: number;
    lastRunAtMs?: number;
    lastStatus?: string;
  };
}

const squadColors: Record<string, { bg: string; border: string }> = {
  main: { bg: 'bg-red-900/50', border: 'border-red-700' },
  frigg: { bg: 'bg-green-900/50', border: 'border-green-700' },
  mimir: { bg: 'bg-teal-900/50', border: 'border-teal-700' },
  bragi: { bg: 'bg-purple-900/50', border: 'border-purple-700' },
  loki: { bg: 'bg-amber-900/50', border: 'border-amber-700' },
  default: { bg: 'bg-gray-900/50', border: 'border-gray-700' },
};

const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const hours = Array.from({ length: 18 }, (_, i) => i + 6); // 06:00 to 23:00

function parseCronExpr(expr: string): { days: number[]; hour: number; minute: number } {
  // Parse cron expression: minute hour day month weekday
  const parts = expr.split(' ');
  if (parts.length < 5) return { days: [], hour: 0, minute: 0 };
  
  const minute = parseInt(parts[0]) || 0;
  const hour = parseInt(parts[1]) || 0;
  
  // Parse weekday field
  const weekdayField = parts[4];
  let daysOfWeek: number[] = [];
  
  if (weekdayField === '*') {
    daysOfWeek = [0, 1, 2, 3, 4, 5, 6];
  } else if (weekdayField.includes('-')) {
    const [start, end] = weekdayField.split('-').map(Number);
    for (let i = start; i <= end; i++) daysOfWeek.push(i);
  } else if (weekdayField.includes(',')) {
    daysOfWeek = weekdayField.split(',').map(Number);
  } else {
    const num = parseInt(weekdayField);
    if (!isNaN(num)) daysOfWeek = [num];
  }
  
  return { days: daysOfWeek, hour, minute };
}

function formatTime(hour: number, minute: number): string {
  return `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
}

function isFrequent(expr: string): boolean {
  // Check if cron runs more than daily (e.g., every 6 hours)
  const parts = expr.split(' ');
  if (parts.length < 2) return false;
  return parts[0].includes('/') || parts[1].includes('/') || parts[1].includes('*');
}

export default function CalendarPage() {
  const [crons, setCrons] = useState<CronJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<'week' | 'today'>('week');
  
  const today = new Date();
  const currentDay = today.getDay();

  useEffect(() => {
    async function fetchCrons() {
      try {
        const res = await fetch('/api/gateway/crons');
        const data = await res.json();
        
        if (data.ok && data.crons) {
          setCrons(data.crons.filter((c: CronJob) => c.enabled));
          setError(null);
        } else {
          setError(data.error || 'Failed to load crons');
        }
      } catch (e) {
        setError('Gateway disconnected');
      }
      setLoading(false);
    }
    
    fetchCrons();
    const interval = setInterval(fetchCrons, 60000);
    return () => clearInterval(interval);
  }, []);

  const alwaysRunning = crons.filter(c => c.schedule?.expr && isFrequent(c.schedule.expr));
  const scheduledCrons = crons.filter(c => c.schedule?.expr && !isFrequent(c.schedule.expr));

  const getTasksForDayAndHour = (dayIndex: number, hour: number) => {
    return scheduledCrons.filter(cron => {
      if (!cron.schedule?.expr) return false;
      const parsed = parseCronExpr(cron.schedule.expr);
      return parsed.days.includes(dayIndex) && parsed.hour === hour;
    }).map(cron => {
      const parsed = parseCronExpr(cron.schedule.expr);
      return {
        ...cron,
        time: formatTime(parsed.hour, parsed.minute),
      };
    });
  };

  return (
    <div className="space-y-6">
      {/* Always Running Section */}
      <div className="bg-gray-900 rounded-lg p-4 border border-gray-800">
        <h3 className="text-sm font-medium text-gray-400 mb-3">Always Running</h3>
        {loading ? (
          <div className="text-gray-500 text-sm">Loading...</div>
        ) : alwaysRunning.length === 0 ? (
          <div className="text-gray-500 text-sm">No frequent jobs</div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {alwaysRunning.map(job => {
              const colors = squadColors[job.agentId] || squadColors.default;
              return (
                <div
                  key={job.id}
                  className={`px-3 py-1.5 rounded-full text-sm flex items-center gap-2 border ${colors.bg} ${colors.border}`}
                >
                  <span className="font-medium text-gray-200 capitalize">{job.agentId}</span>
                  <span className="text-gray-500">•</span>
                  <span className="text-gray-400">{job.name}</span>
                  <span className="text-gray-500 text-xs">{job.schedule?.expr}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Error Banner */}
      {error && (
        <div className="bg-red-900/20 border border-red-700 rounded-lg p-4 text-red-400">
          {error} — showing cached data
        </div>
      )}

      {/* Header with Toggle */}
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-semibold text-gray-100">Schedule</h2>
        <div className="flex gap-2">
          <button
            onClick={() => setView('week')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              view === 'week'
                ? 'bg-amber-500 text-gray-900'
                : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
            }`}
          >
            Week
          </button>
          <button
            onClick={() => setView('today')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              view === 'today'
                ? 'bg-amber-500 text-gray-900'
                : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
            }`}
          >
            Today
          </button>
        </div>
      </div>

      {/* Calendar Grid */}
      <div className="bg-gray-900 rounded-lg border border-gray-800 overflow-hidden">
        {/* Day Headers */}
        <div className="grid grid-cols-8 border-b border-gray-800">
          <div className="p-3 text-sm text-gray-500 border-r border-gray-800">Time</div>
          {(view === 'week' ? days : [days[currentDay]]).map((day, idx) => {
            const dayIndex = view === 'week' ? idx : currentDay;
            const isToday = dayIndex === currentDay;
            return (
              <div
                key={day}
                className={`p-3 text-sm font-medium text-center border-r border-gray-800 last:border-r-0 ${
                  isToday ? 'bg-amber-500/10 text-amber-500 border-b-2 border-b-amber-500' : 'text-gray-400'
                }`}
              >
                {day}
              </div>
            );
          })}
        </div>

        {/* Time Slots */}
        <div className="max-h-[600px] overflow-y-auto">
          {hours.map(hour => (
            <div key={hour} className="grid grid-cols-8 border-b border-gray-800 last:border-b-0">
              <div className="p-2 text-xs text-gray-500 border-r border-gray-800 flex items-start">
                {hour.toString().padStart(2, '0')}:00
              </div>
              {(view === 'week' ? days : [days[currentDay]]).map((day, idx) => {
                const dayIndex = view === 'week' ? idx : currentDay;
                const tasks = getTasksForDayAndHour(dayIndex, hour);
                const isToday = dayIndex === currentDay;
                return (
                  <div
                    key={`${day}-${hour}`}
                    className={`p-1 min-h-[60px] border-r border-gray-800 last:border-r-0 ${
                      isToday ? 'bg-amber-500/5' : ''
                    }`}
                  >
                    {tasks.map((task, taskIdx) => {
                      const colors = squadColors[task.agentId] || squadColors.default;
                      return (
                        <div
                          key={taskIdx}
                          className={`p-2 rounded text-xs ${colors.bg} border ${colors.border} mb-1`}
                        >
                          <div className="font-medium text-gray-200 capitalize">{task.agentId}</div>
                          <div className="text-gray-400 truncate">{task.name}</div>
                          <div className="text-gray-500">{task.time}</div>
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {/* Cron List */}
      <div className="bg-gray-900 rounded-lg p-6 border border-gray-800">
        <h3 className="text-lg font-semibold text-gray-100 mb-4">All Scheduled Jobs ({crons.length})</h3>
        <div className="space-y-2">
          {crons.map(cron => {
            const colors = squadColors[cron.agentId] || squadColors.default;
            return (
              <div
                key={cron.id}
                className={`p-3 rounded-lg border ${colors.border} ${colors.bg} flex justify-between items-center`}
              >
                <div>
                  <span className="font-medium text-gray-200">{cron.name}</span>
                  <span className="text-gray-500 mx-2">•</span>
                  <span className="text-gray-400 capitalize">{cron.agentId}</span>
                </div>
                <div className="text-right">
                  <div className="text-sm text-gray-400 font-mono">{cron.schedule?.expr}</div>
                  {cron.state?.nextRunAtMs && (
                    <div className="text-xs text-gray-500">
                      Next: {new Date(cron.state.nextRunAtMs).toLocaleString()}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
