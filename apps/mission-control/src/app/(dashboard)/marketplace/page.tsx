'use client';

import { useState, useEffect } from 'react';
import { useAccount, useConnect, useDisconnect, useBalance } from 'wagmi';

interface PackTemplate {
  name: string;
  version: string;
  description: string;
  author: string;
  squad: { id: string; name: string; domain: string };
  agents: { id: string; name: string; emoji: string; role: string }[];
  file: string;
}

function WalletPanel() {
  const { address, isConnected, chain } = useAccount();
  const { connectors, connect } = useConnect();
  const { disconnect } = useDisconnect();
  const { data: balance } = useBalance({ address });

  if (isConnected) {
    return (
      <div className="bg-[#111113] rounded-lg border border-[#1e1e21] p-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-green-500/20 rounded-full flex items-center justify-center">
            <span className="text-green-400 text-xs">✓</span>
          </div>
          <div>
            <div className="text-sm text-gray-200 font-mono">
              {address?.slice(0, 6)}...{address?.slice(-4)}
            </div>
            <div className="text-[10px] text-gray-500">
              {chain?.name} • {balance ? `${(Number(balance.value) / 10 ** balance.decimals).toFixed(4)} ${balance.symbol}` : 'Loading...'}
            </div>
          </div>
        </div>
        <button
          onClick={() => disconnect()}
          className="px-3 py-1.5 text-xs text-gray-400 bg-[#1a1a1d] rounded border border-[#1e1e21] hover:text-red-400"
        >
          Disconnect
        </button>
      </div>
    );
  }

  return (
    <div className="bg-[#111113] rounded-lg border border-[#1e1e21] p-6 text-center">
      <div className="text-3xl mb-3">🔗</div>
      <h3 className="text-sm font-medium text-gray-200 mb-2">Connect Wallet</h3>
      <p className="text-xs text-gray-500 mb-4">
        Connect to browse and purchase premium squad packs and agent templates
      </p>
      <div className="flex flex-col gap-2 max-w-xs mx-auto">
        {connectors.map((connector) => (
          <button
            key={connector.uid}
            onClick={() => connect({ connector })}
            className="px-4 py-2 text-xs font-medium bg-amber-500 text-gray-900 rounded hover:bg-amber-400"
          >
            {connector.name}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function MarketplacePage() {
  const [packs, setPacks] = useState<PackTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [installing, setInstalling] = useState<string | null>(null);
  const [installResult, setInstallResult] = useState<{ name: string; ok: boolean; message: string } | null>(null);

  useEffect(() => {
    fetch('/api/packs')
      .then(r => r.json())
      .then(data => {
        if (data.ok) setPacks(data.packs);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleInstall = async (pack: PackTemplate) => {
    setInstalling(pack.squad.id);
    setInstallResult(null);
    try {
      const res = await fetch('/api/packs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(pack),
      });
      const data = await res.json();
      setInstallResult({
        name: pack.name,
        ok: data.ok,
        message: data.ok
          ? `Installed ${data.created} agents (${data.skipped} skipped)`
          : data.error,
      });
    } catch (e) {
      setInstallResult({ name: pack.name, ok: false, message: e instanceof Error ? e.message : 'Install failed' });
    }
    setInstalling(null);
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-xl font-semibold text-gray-100">Marketplace</h2>
        <p className="text-sm text-gray-500 mt-1">
          Squad packs, agent templates, and premium skills
        </p>
      </div>

      {/* Wallet */}
      <WalletPanel />

      {/* Install result */}
      {installResult && (
        <div className={`px-4 py-3 rounded-lg text-sm ${installResult.ok ? 'bg-green-500/10 text-green-400 border border-green-500/20' : 'bg-red-500/10 text-red-400 border border-red-500/20'}`}>
          <span className="font-medium">{installResult.name}:</span> {installResult.message}
        </div>
      )}

      {/* Free Packs */}
      <div>
        <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">
          Free Packs
        </h3>
        {loading ? (
          <div className="text-gray-500 text-sm">Loading packs...</div>
        ) : packs.length === 0 ? (
          <div className="bg-[#111113] rounded-lg border border-[#1e1e21] p-8 text-center text-gray-500">
            <div className="text-3xl mb-2">📦</div>
            <p>No packs available yet</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {packs.map(pack => (
              <div key={pack.squad.id} className="bg-[#111113] rounded-lg border border-[#1e1e21] p-5 hover:border-[#333] transition-colors">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h4 className="font-semibold text-gray-100">{pack.name}</h4>
                    <span className="text-[10px] text-gray-600">v{pack.version} by {pack.author}</span>
                  </div>
                  <span className="text-xs bg-green-500/20 text-green-400 px-2 py-0.5 rounded">Free</span>
                </div>
                <p className="text-xs text-gray-400 mb-3">{pack.description}</p>
                <div className="flex flex-wrap gap-1 mb-4">
                  {pack.agents.map(agent => (
                    <span key={agent.id} className="text-xs bg-[#1a1a1d] text-gray-300 px-2 py-0.5 rounded">
                      {agent.emoji} {agent.name}
                    </span>
                  ))}
                </div>
                <button
                  onClick={() => handleInstall(pack)}
                  disabled={installing === pack.squad.id}
                  className="w-full px-4 py-2 text-xs font-medium bg-amber-500 text-gray-900 rounded hover:bg-amber-400 disabled:opacity-50"
                >
                  {installing === pack.squad.id ? 'Installing...' : `Install (${pack.agents.length} agents)`}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Premium Packs (Coming Soon) */}
      <div>
        <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">
          Premium Packs
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[
            { name: 'DeFi Trading Squad', price: '$49/mo', agents: 4, desc: 'Automated DeFi monitoring, yield farming, and portfolio management' },
            { name: 'Security Audit Pack', price: '$99/mo', agents: 3, desc: 'Smart contract auditing, vulnerability scanning, and compliance' },
            { name: 'Content Empire', price: '$29/mo', agents: 5, desc: 'Multi-platform content creation, scheduling, analytics, and SEO' },
            { name: 'DevOps Squad', price: '$49/mo', agents: 4, desc: 'CI/CD, monitoring, incident response, and infrastructure automation' },
          ].map(pack => (
            <div key={pack.name} className="bg-[#111113] rounded-lg border border-[#1e1e21] p-5 opacity-60">
              <div className="flex items-start justify-between mb-2">
                <h4 className="font-semibold text-gray-100">{pack.name}</h4>
                <span className="text-xs bg-amber-500/20 text-amber-400 px-2 py-0.5 rounded">{pack.price}</span>
              </div>
              <p className="text-xs text-gray-400 mb-3">{pack.desc}</p>
              <div className="text-[10px] text-gray-600 mb-3">{pack.agents} agents included</div>
              <button disabled className="w-full px-4 py-2 text-xs font-medium bg-gray-700 text-gray-400 rounded cursor-not-allowed">
                Coming Soon
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* NFT Licenses (Coming Soon) */}
      <div className="bg-[#111113] rounded-lg border border-[#1e1e21] p-6 text-center opacity-60">
        <div className="text-3xl mb-2">🎫</div>
        <h3 className="font-semibold text-gray-200">NFT Agent Licenses</h3>
        <p className="text-xs text-gray-500 mt-2 max-w-md mx-auto">
          Purchase agent templates as NFTs on Base L2. Creator royalties on resale.
          Transferable licenses. On-chain reputation.
        </p>
        <div className="text-[10px] text-gray-600 mt-3">Coming in v0.6</div>
      </div>
    </div>
  );
}
