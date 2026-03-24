const projects = [
  { name: "ClawHalla", status: "active", description: "Enterprise AI Operating System — Mission Control dashboard", progress: 30, squad: "dev_squad", updatedDaysAgo: 0 },
  { name: "Mission Control", status: "active", description: "Next.js dashboard for agent orchestration", progress: 35, squad: "dev_squad", updatedDaysAgo: 0 },
  { name: "Content Strategy", status: "active", description: "LinkedIn + social media content pipeline", progress: 60, squad: "clop_cabinet", updatedDaysAgo: 1 },
  { name: "IPÊ City Outreach", status: "active", description: "Community event Apr-May 2026 Jurerê Internacional", progress: 15, squad: null, updatedDaysAgo: 2 },
  { name: "Safe City", status: "active", description: "Anonymous community safety alert PWA for Florianópolis", progress: 45, squad: "dev_squad", updatedDaysAgo: 5 },
  { name: "Cronos Shield", status: "paused", description: "AI-powered security ecosystem for Cronos chain", progress: 80, squad: "blockchain_squad", updatedDaysAgo: 14 },
  { name: "DeegaLabs Webapp", status: "paused", description: "Portfolio website for DeegaLabs", progress: 90, squad: "dev_squad", updatedDaysAgo: 10 },
  { name: "Shielded BTC", status: "paused", description: "BTC Collateral Protocol on StarkNet", progress: 70, squad: "blockchain_squad", updatedDaysAgo: 21 },
];

const statusStyles: Record<string, { bg: string; text: string }> = {
  active: { bg: 'bg-green-500/20', text: 'text-green-400' },
  paused: { bg: 'bg-amber-500/20', text: 'text-amber-400' },
  planning: { bg: 'bg-blue-500/20', text: 'text-blue-400' },
};

const squadStyles: Record<string, { bg: string; text: string; progress: string }> = {
  dev_squad: { bg: 'bg-blue-500/20', text: 'text-blue-400', progress: 'bg-blue-500' },
  blockchain_squad: { bg: 'bg-purple-500/20', text: 'text-purple-400', progress: 'bg-purple-500' },
  clop_cabinet: { bg: 'bg-green-500/20', text: 'text-green-400', progress: 'bg-green-500' },
  product_squad: { bg: 'bg-amber-500/20', text: 'text-amber-400', progress: 'bg-amber-500' },
};

const defaultSquadStyle = { bg: 'bg-gray-500/20', text: 'text-gray-400', progress: 'bg-gray-500' };

function formatSquadName(squad: string | null): string {
  if (!squad) return 'Unassigned';
  return squad.replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase());
}

export default function ProjectsPage() {
  const activeCount = projects.filter(p => p.status === 'active').length;
  const pausedCount = projects.filter(p => p.status === 'paused').length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <h2 className="text-2xl font-bold text-gray-100">Projects</h2>
        <div className="flex gap-2 text-sm">
          <span className="px-2 py-1 bg-gray-800 rounded text-gray-400">
            {projects.length} total
          </span>
          <span className="px-2 py-1 bg-green-500/20 rounded text-green-400">
            {activeCount} active
          </span>
          <span className="px-2 py-1 bg-amber-500/20 rounded text-amber-400">
            {pausedCount} paused
          </span>
        </div>
      </div>

      {/* Project Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {projects.map(project => {
          const status = statusStyles[project.status] || statusStyles.planning;
          const squad = project.squad ? squadStyles[project.squad] : defaultSquadStyle;
          
          return (
            <div
              key={project.name}
              className="bg-gray-900 rounded-lg p-5 border border-gray-800 hover:border-gray-700 transition-colors"
            >
              {/* Header */}
              <div className="flex items-start justify-between mb-3">
                <h3 className="font-semibold text-gray-100">{project.name}</h3>
                <span className={`px-2 py-0.5 text-xs rounded ${status.bg} ${status.text} capitalize`}>
                  {project.status}
                </span>
              </div>

              {/* Description */}
              <p className="text-sm text-gray-400 mb-4 line-clamp-2">
                {project.description}
              </p>

              {/* Progress Bar */}
              <div className="mb-3">
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-gray-500">Progress</span>
                  <span className="text-gray-400">{project.progress}%</span>
                </div>
                <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
                  <div
                    className={`h-full ${squad.progress} rounded-full transition-all`}
                    style={{ width: `${project.progress}%` }}
                  />
                </div>
              </div>

              {/* Footer */}
              <div className="flex items-center justify-between pt-3 border-t border-gray-800">
                <span className={`px-2 py-0.5 text-xs rounded ${squad.bg} ${squad.text}`}>
                  {formatSquadName(project.squad)}
                </span>
                <span className="text-xs text-gray-500">
                  {project.updatedDaysAgo === 0 
                    ? 'Updated today' 
                    : `Updated ${project.updatedDaysAgo}d ago`}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
