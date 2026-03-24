const agents = [
  { name: "Claw", emoji: "🦞", role: "System Controller", model: "claude-opus-4-5", tier: 0, squad: null, reportsTo: "Daniel (CEO)" },
  { name: "Odin", emoji: "👁️", role: "CTO", model: "claude-sonnet-4-6", tier: 1, squad: "dev_squad", reportsTo: "Claw" },
  { name: "Vidar", emoji: "⛓️", role: "Blockchain Architect", model: "claude-sonnet-4-6", tier: 1, squad: "blockchain_squad", reportsTo: "Claw" },
  { name: "Saga", emoji: "📜", role: "Research Lead (CPO)", model: "claude-sonnet-4-6", tier: 1, squad: "product_squad", reportsTo: "Claw" },
  { name: "Thor", emoji: "⚡", role: "Tech Lead", model: "claude-sonnet-4-5", tier: 2, squad: "dev_squad", reportsTo: "Odin" },
  { name: "Frigg", emoji: "👑", role: "Coordinator / PA", model: "claude-haiku-4-5", tier: 2, squad: "clop_cabinet", reportsTo: "Odin" },
  { name: "Tyr", emoji: "⚖️", role: "Security Auditor", model: "claude-opus-4-5", tier: 2, squad: "blockchain_squad", reportsTo: "Vidar" },
  { name: "Freya", emoji: "✨", role: "Senior Developer", model: "claude-sonnet-4-5", tier: 3, squad: "dev_squad", reportsTo: "Thor" },
  { name: "Heimdall", emoji: "👁️‍🗨️", role: "QA / Observability", model: "claude-haiku-4-5", tier: 3, squad: "dev_squad", reportsTo: "Thor" },
  { name: "Volund", emoji: "🔨", role: "Developer / GitHub", model: "claude-sonnet-4-5", tier: 3, squad: "dev_squad", reportsTo: "Thor" },
  { name: "Sindri", emoji: "🔥", role: "Solidity Developer", model: "claude-sonnet-4-5", tier: 3, squad: "blockchain_squad", reportsTo: "Vidar" },
  { name: "Skadi", emoji: "❄️", role: "Cairo Developer", model: "claude-sonnet-4-5", tier: 3, squad: "blockchain_squad", reportsTo: "Vidar" },
  { name: "Mimir", emoji: "🧠", role: "Knowledge Curator", model: "claude-sonnet-4-5", tier: 3, squad: "clop_cabinet", reportsTo: "Frigg" },
  { name: "Bragi", emoji: "🎭", role: "Content Creator", model: "claude-sonnet-4-5", tier: 3, squad: "clop_cabinet", reportsTo: "Frigg" },
  { name: "Loki", emoji: "🎲", role: "Monitor / Analytics", model: "claude-sonnet-4-5", tier: 3, squad: "clop_cabinet", reportsTo: "Frigg" },
];

const squads = [
  { id: "dev_squad", name: "Dev Squad", chief: "Odin", domain: "Software development, infrastructure, and DevOps", color: "blue" },
  { id: "blockchain_squad", name: "Blockchain Squad", chief: "Vidar", domain: "Smart contracts, Solidity, Cairo, and Web3", color: "purple" },
  { id: "clop_cabinet", name: "Clop Cabinet", chief: "Frigg", domain: "Personal assistance, content, research, and analytics", color: "green" },
  { id: "product_squad", name: "Product Squad", chief: "Saga", domain: "Product strategy, research, and market analysis", color: "amber" },
];

const modelColors: Record<string, string> = {
  'claude-opus-4-5': 'bg-red-500/20 text-red-400 border-red-500/50',
  'claude-sonnet-4-6': 'bg-amber-500/20 text-amber-400 border-amber-500/50',
  'claude-sonnet-4-5': 'bg-blue-500/20 text-blue-400 border-blue-500/50',
  'claude-haiku-4-5': 'bg-green-500/20 text-green-400 border-green-500/50',
};

const squadBorderColors: Record<string, string> = {
  dev_squad: 'border-l-blue-500',
  blockchain_squad: 'border-l-purple-500',
  clop_cabinet: 'border-l-green-500',
  product_squad: 'border-l-amber-500',
};

const tierLabels = ['PLATFORM', 'EXECUTIVE', 'MANAGEMENT', 'EXECUTION'];

function AgentCard({ agent }: { agent: typeof agents[0] }) {
  const modelColor = modelColors[agent.model] || 'bg-gray-500/20 text-gray-400';
  const squadBorder = agent.squad ? squadBorderColors[agent.squad] : 'border-l-gray-500';
  
  return (
    <div className={`bg-gray-800 rounded-lg p-4 border border-gray-700 border-l-4 ${squadBorder} hover:border-gray-600 transition-colors`}>
      <div className="text-3xl mb-2">{agent.emoji}</div>
      <div className="font-semibold text-gray-100">{agent.name}</div>
      <div className="text-sm text-gray-400 mt-1">{agent.role}</div>
      <div className={`inline-block px-2 py-0.5 text-xs rounded border mt-2 ${modelColor}`}>
        {agent.model.replace('claude-', '')}
      </div>
      <div className="flex items-center gap-2 mt-3">
        <span className="w-2 h-2 rounded-full bg-green-500"></span>
        <span className="text-xs text-green-400">active</span>
      </div>
      <div className="text-xs text-gray-500 mt-2">reports to: {agent.reportsTo}</div>
    </div>
  );
}

export default function TeamPage() {
  const tier0 = agents.filter(a => a.tier === 0);
  const tier1 = agents.filter(a => a.tier === 1);
  const tier2 = agents.filter(a => a.tier === 2);
  const tier3 = agents.filter(a => a.tier === 3);

  return (
    <div className="space-y-8">
      {/* Mission Statement */}
      <div className="bg-amber-900/20 border border-amber-700 rounded-lg p-6 text-center">
        <p className="text-lg italic text-amber-200">
          "Enterprise Autonomous AI Operating System — Monte seu time de desenvolvimento AI"
        </p>
      </div>

      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold text-gray-100">Meet the Team</h2>
        <p className="text-gray-400 mt-1">15 AI agents across 4 squads</p>
      </div>

      {/* Tier 0 - Platform */}
      <div>
        <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-4">
          Tier 0 — {tierLabels[0]}
        </div>
        <div className="flex justify-center">
          <div className="w-80">
            <AgentCard agent={tier0[0]} />
          </div>
        </div>
        {/* Connection line */}
        <div className="flex justify-center my-4">
          <div className="w-px h-8 bg-gray-700"></div>
        </div>
      </div>

      {/* Tier 1 - Executive */}
      <div>
        <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-4">
          Tier 1 — {tierLabels[1]}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 max-w-4xl mx-auto">
          {tier1.map(agent => (
            <AgentCard key={agent.name} agent={agent} />
          ))}
        </div>
        <div className="flex justify-center my-4">
          <div className="w-px h-8 bg-gray-700"></div>
        </div>
      </div>

      {/* Tier 2 - Management */}
      <div>
        <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-4">
          Tier 2 — {tierLabels[2]}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 max-w-4xl mx-auto">
          {tier2.map(agent => (
            <AgentCard key={agent.name} agent={agent} />
          ))}
        </div>
        <div className="flex justify-center my-4">
          <div className="w-px h-8 bg-gray-700"></div>
        </div>
      </div>

      {/* Tier 3 - Execution */}
      <div>
        <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-4">
          Tier 3 — {tierLabels[3]}
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {tier3.map(agent => (
            <AgentCard key={agent.name} agent={agent} />
          ))}
        </div>
      </div>

      {/* Squad Summary */}
      <div className="mt-12">
        <h3 className="text-xl font-semibold text-gray-100 mb-4">Squads</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {squads.map(squad => {
            const members = agents.filter(a => a.squad === squad.id);
            const borderColor = {
              blue: 'border-l-blue-500',
              purple: 'border-l-purple-500',
              green: 'border-l-green-500',
              amber: 'border-l-amber-500',
            }[squad.color];
            
            return (
              <div key={squad.id} className={`bg-gray-900 rounded-lg p-4 border border-gray-800 border-l-4 ${borderColor}`}>
                <h4 className="font-semibold text-gray-100">{squad.name}</h4>
                <div className="text-sm text-gray-400 mt-1">Chief: {squad.chief}</div>
                <p className="text-xs text-gray-500 mt-2">{squad.domain}</p>
                <div className="mt-3 flex flex-wrap gap-1">
                  {members.map(m => (
                    <span key={m.name} className="text-xs bg-gray-800 px-2 py-0.5 rounded text-gray-400">
                      {m.emoji} {m.name}
                    </span>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
