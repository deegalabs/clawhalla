'use client';

interface SystemStatusProps {
  gatewayOk: boolean;
  agents: Array<{ state: string }>;
  totalSessions: number;
}

export function SystemStatus({ gatewayOk, agents, totalSessions }: SystemStatusProps) {
  const onlineAgents = agents.filter(a => a.state !== 'offline').length;
  const totalAgents = agents.length;

  const items = [
    {
      label: 'Gateway',
      value: gatewayOk ? 'Online' : 'Offline',
      dot: gatewayOk ? 'bg-green-500' : 'bg-red-500 animate-pulse',
      valueColor: gatewayOk ? 'text-green-400' : 'text-red-400',
    },
    {
      label: 'Active Sessions',
      value: String(totalSessions),
      dot: totalSessions > 0 ? 'bg-green-500' : 'bg-gray-600',
      valueColor: totalSessions > 0 ? 'text-green-400' : 'text-gray-500',
    },
    {
      label: 'Agents Online',
      value: `${onlineAgents}/${totalAgents}`,
      dot: onlineAgents > 0 ? 'bg-green-500' : 'bg-gray-600',
      valueColor: onlineAgents > 0 ? 'text-green-400' : 'text-gray-500',
    },
    {
      label: 'Telegram',
      value: gatewayOk ? 'Connected' : 'Disconnected',
      dot: gatewayOk ? 'bg-green-500' : 'bg-gray-600',
      valueColor: gatewayOk ? 'text-green-400' : 'text-gray-500',
    },
  ];

  return (
    <div className="bg-[#111113] rounded-lg border border-[#1e1e21] overflow-hidden">
      <div className="px-4 py-3 border-b border-[#1e1e21]">
        <span className="text-xs font-medium text-gray-300">System Status</span>
      </div>
      <div className="p-4 space-y-3">
        {items.map(item => (
          <div key={item.label} className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full ${item.dot}`} />
              <span className="text-[11px] text-gray-400">{item.label}</span>
            </div>
            <span className={`text-[11px] font-medium ${item.valueColor}`}>{item.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
