'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, useEffect } from 'react';

const navLinks = [
  { href: '/', label: 'Dashboard', icon: '📊' },
  { href: '/tasks', label: 'Tasks', icon: '✓' },
  { href: '/calendar', label: 'Calendar', icon: '📅' },
  { href: '/projects', label: 'Projects', icon: '📁' },
  { href: '/memory', label: 'Memory', icon: '🧠' },
  { href: '/docs', label: 'Docs', icon: '📚' },
  { href: '/team', label: 'Team', icon: '👥' },
  { href: '/approvals', label: 'Approvals', icon: '✋' }
];

function GatewayHealthIndicator() {
  const [healthy, setHealthy] = useState<boolean | null>(null);

  useEffect(() => {
    const check = async () => {
      try {
        const res = await fetch('/api/health');
        const data = await res.json();
        setHealthy(data.status === 'ok');
      } catch {
        setHealthy(false);
      }
    };
    check();
    const interval = setInterval(check, 30000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="flex items-center gap-2">
      <div className={`w-2 h-2 rounded-full ${healthy === null ? 'bg-gray-500' : healthy ? 'bg-green-500' : 'bg-red-500'}`} />
      <span className="text-sm text-gray-400">Gateway {healthy === null ? 'checking...' : healthy ? 'online' : 'offline'}</span>
    </div>
  );
}

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  return (
    <div className="flex h-screen bg-gray-950">
      {/* Sidebar */}
      <aside className="w-64 bg-gray-900 border-r border-gray-800 flex flex-col">
        <div className="p-6 border-b border-gray-800">
          <h1 className="text-2xl font-bold text-amber-500 flex items-center gap-2">
            🦞 Mission Control
          </h1>
        </div>
        <nav className="flex-1 p-4 space-y-1">
          {navLinks.map((link) => {
            const isActive = pathname === link.href;
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`flex items-center gap-3 px-4 py-2 rounded-lg transition-colors ${
                  isActive
                    ? 'bg-amber-500/10 text-amber-500'
                    : 'text-gray-400 hover:bg-gray-800 hover:text-gray-300'
                }`}
              >
                <span>{link.icon}</span>
                <span>{link.label}</span>
              </Link>
            );
          })}
        </nav>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col ml-0">
        {/* Top bar */}
        <header className="h-16 bg-gray-900 border-b border-gray-800 flex items-center justify-between px-6">
          <h2 className="text-lg font-semibold text-gray-100">
            {navLinks.find((l) => l.href === pathname)?.label || 'Dashboard'}
          </h2>
          <GatewayHealthIndicator />
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-auto p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
