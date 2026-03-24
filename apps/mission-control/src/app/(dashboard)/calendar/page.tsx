'use client';

import { useState } from 'react';

const alwaysRunning = [
  { agent: "Frigg", task: "Morning Brief", time: "07:03" },
  { agent: "Frigg", task: "EOD Summary", time: "17:47" },
  { agent: "Mimir", task: "Research Digest", time: "18:13" },
  { agent: "Loki", task: "Weekly Brief", time: "Fri 09:17" },
  { agent: "Claw", task: "Memory Maintenance", time: "23:43" },
];

const scheduledTasks = [
  { agent: "Frigg", task: "Morning Brief", time: "07:03", days: [1,2,3,4,5], squad: "clop_cabinet" },
  { agent: "Frigg", task: "EOD Summary", time: "17:47", days: [1,2,3,4,5], squad: "clop_cabinet" },
  { agent: "Mimir", task: "Research Digest", time: "18:13", days: [0,1,2,3,4,5,6], squad: "clop_cabinet" },
  { agent: "Loki", task: "Weekly Brief", time: "09:17", days: [5], squad: "clop_cabinet" },
  { agent: "Claw", task: "Memory Maintenance", time: "23:43", days: [0,1,2,3,4,5,6], squad: "platform" },
];

const squadColors: Record<string, { bg: string; border: string }> = {
  dev_squad: { bg: 'bg-blue-900/50', border: 'border-blue-700' },
  blockchain_squad: { bg: 'bg-purple-900/50', border: 'border-purple-700' },
  clop_cabinet: { bg: 'bg-green-900/50', border: 'border-green-700' },
  product_squad: { bg: 'bg-amber-900/50', border: 'border-amber-700' },
  platform: { bg: 'bg-red-900/50', border: 'border-red-700' },
};

const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const hours = Array.from({ length: 18 }, (_, i) => i + 6); // 06:00 to 23:00

export default function CalendarPage() {
  const [view, setView] = useState<'week' | 'today'>('week');
  const today = new Date();
  const currentDay = today.getDay();

  const getTasksForDayAndHour = (dayIndex: number, hour: number) => {
    return scheduledTasks.filter(task => {
      const taskHour = parseInt(task.time.split(':')[0]);
      return task.days.includes(dayIndex) && taskHour === hour;
    });
  };

  return (
    <div className="space-y-6">
      {/* Always Running Section */}
      <div className="bg-gray-900 rounded-lg p-4 border border-gray-800">
        <h3 className="text-sm font-medium text-gray-400 mb-3">Always Running</h3>
        <div className="flex flex-wrap gap-2">
          {alwaysRunning.map((job, idx) => (
            <div
              key={idx}
              className="px-3 py-1.5 bg-gray-800 rounded-full text-sm flex items-center gap-2 border border-gray-700"
            >
              <span className="font-medium text-gray-200">{job.agent}</span>
              <span className="text-gray-500">•</span>
              <span className="text-gray-400">{job.task}</span>
              <span className="text-gray-500">{job.time}</span>
            </div>
          ))}
        </div>
      </div>

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
                      const colors = squadColors[task.squad] || { bg: 'bg-gray-800', border: 'border-gray-600' };
                      return (
                        <div
                          key={taskIdx}
                          className={`p-2 rounded text-xs ${colors.bg} border ${colors.border} mb-1`}
                        >
                          <div className="font-medium text-gray-200">{task.agent}</div>
                          <div className="text-gray-400">{task.task}</div>
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
    </div>
  );
}
