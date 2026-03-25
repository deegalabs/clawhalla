'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, useEffect } from 'react';

// Minimal SVG icons (16x16)
function DashboardIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="1" y="1" width="6" height="6" rx="1" />
      <rect x="9" y="1" width="6" height="6" rx="1" />
      <rect x="1" y="9" width="6" height="6" rx="1" />
      <rect x="9" y="9" width="6" height="6" rx="1" />
    </svg>
  );
}

function TasksIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 8l2.5 2.5L10 6" />
      <rect x="1" y="1" width="14" height="14" rx="2" />
    </svg>
  );
}

function CalendarIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="1" y="2.5" width="14" height="12" rx="2" />
      <path d="M1 6.5h14" />
      <path d="M4.5 1v3M11.5 1v3" />
    </svg>
  );
}

function ProjectsIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 4l6-2.5L13 4" />
      <rect x="2" y="4" width="12" height="10" rx="1" />
      <path d="M6 4v10M2 8.5h12" />
    </svg>
  );
}

function MemoryIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="8" cy="8" r="6.5" />
      <path d="M8 4v4l2.5 1.5" />
    </svg>
  );
}

function DocsIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 1.5h7l4 4V14a1 1 0 01-1 1H3a1 1 0 01-1-1V2.5a1 1 0 011-1z" />
      <path d="M10 1.5v4h4" />
      <path d="M5 8h6M5 10.5h6M5 13h3" />
    </svg>
  );
}

function TeamIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="6" cy="5" r="2.5" />
      <path d="M1.5 14c0-2.5 2-4.5 4.5-4.5s4.5 2 4.5 4.5" />
      <circle cx="11.5" cy="4.5" r="2" />
      <path d="M11.5 9c1.5 0 3 1 3.5 3" />
    </svg>
  );
}

function ApprovalsIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 1.5l2 4 4.5.5-3.25 3 .75 4.5L8 11.5 3.95 13.5l.75-4.5L1.5 6l4.5-.5z" />
    </svg>
  );
}

function CouncilIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="8" cy="4" r="2.5" />
      <circle cx="3" cy="11" r="2" />
      <circle cx="13" cy="11" r="2" />
      <path d="M5.5 5.5L4 9M10.5 5.5L12 9" />
    </svg>
  );
}

function FeedbackIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 2h12v9H5l-3 3V2z" />
      <path d="M5 6h6M5 9h3" />
    </svg>
  );
}

function MarketplaceIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 6l2-4h10l2 4" />
      <rect x="1" y="6" width="14" height="8" rx="1" />
      <path d="M6 6v8M10 6v8" />
    </svg>
  );
}

function ContentIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 3h12M2 6.5h8M2 10h10M2 13.5h6" />
    </svg>
  );
}

function SettingsIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="8" cy="8" r="2.5" />
      <path d="M8 1v2M8 13v2M1 8h2M13 8h2M3.05 3.05l1.4 1.4M11.55 11.55l1.4 1.4M3.05 12.95l1.4-1.4M11.55 4.45l1.4-1.4" />
    </svg>
  );
}

function SearchIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <circle cx="7" cy="7" r="5" />
      <path d="M11 11l3.5 3.5" />
    </svg>
  );
}

const navSections = [
  {
    label: 'Work',
    links: [
      { href: '/dashboard', label: 'Dashboard', icon: DashboardIcon },
      { href: '/tasks', label: 'Tasks', icon: TasksIcon },
      { href: '/projects', label: 'Projects', icon: ProjectsIcon },
      { href: '/calendar', label: 'Calendar', icon: CalendarIcon },
      { href: '/approvals', label: 'Approvals', icon: ApprovalsIcon },
    ],
  },
  {
    label: 'Knowledge',
    links: [
      { href: '/memory', label: 'Memory', icon: MemoryIcon },
      { href: '/docs', label: 'Docs', icon: DocsIcon },
      { href: '/content', label: 'Content', icon: ContentIcon },
      { href: '/council', label: 'Council', icon: CouncilIcon },
    ],
  },
  {
    label: 'System',
    links: [
      { href: '/team', label: 'Team', icon: TeamIcon },
      { href: '/feedback', label: 'Feedback', icon: FeedbackIcon },
      { href: '/marketplace', label: 'Marketplace', icon: MarketplaceIcon },
      { href: '/settings', label: 'Settings', icon: SettingsIcon },
    ],
  },
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
      <div className={`w-1.5 h-1.5 rounded-full ${healthy === null ? 'bg-gray-600' : healthy ? 'bg-green-500' : 'bg-red-500'}`} />
      <span className="text-xs text-gray-500">
        {healthy === null ? 'Checking' : healthy ? 'Gateway online' : 'Gateway offline'}
      </span>
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
    <div className="flex h-screen bg-[#0a0a0b]">
      {/* Sidebar */}
      <aside className="w-56 bg-[#111113] border-r border-[#1e1e21] flex flex-col">
        {/* Logo */}
        <div className="px-5 py-4 border-b border-[#1e1e21]">
          <Link href="/" className="flex items-center gap-2.5">
            <span className="text-xl">🦞</span>
            <span className="text-sm font-semibold text-gray-100 tracking-tight">Mission Control</span>
          </Link>
        </div>

        {/* Search shortcut */}
        <div className="px-3 py-3">
          <Link
            href="/docs"
            className="flex items-center gap-2 px-3 py-1.5 text-xs text-gray-500 bg-[#1a1a1d] rounded-md border border-[#1e1e21] hover:border-[#333] hover:text-gray-400"
          >
            <SearchIcon />
            <span>Search</span>
            <kbd className="ml-auto">⌘K</kbd>
          </Link>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 space-y-4 overflow-y-auto py-1">
          {navSections.map((section) => (
            <div key={section.label}>
              <div className="px-3 mb-1.5 text-[10px] font-semibold text-gray-600 uppercase tracking-widest">
                {section.label}
              </div>
              <div className="space-y-0.5">
                {section.links.map((link) => {
                  const isActive = pathname === link.href;
                  const Icon = link.icon;
                  return (
                    <Link
                      key={link.href}
                      href={link.href}
                      className={`flex items-center gap-2.5 px-3 py-1.5 rounded-md text-[13px] font-medium ${
                        isActive
                          ? 'bg-[#1e1e21] text-gray-100'
                          : 'text-gray-500 hover:bg-[#1a1a1d] hover:text-gray-300'
                      }`}
                    >
                      <Icon className={isActive ? 'text-amber-500' : 'text-gray-600'} />
                      <span>{link.label}</span>
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-[#1e1e21]">
          <GatewayHealthIndicator />
          <div className="text-[10px] text-gray-700 mt-1.5">ClawHalla v1.0</div>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col">
        {/* Top bar */}
        <header className="h-12 bg-[#111113] border-b border-[#1e1e21] flex items-center justify-between px-6">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-medium text-gray-200">
              {navSections.flatMap(s => s.links).find((l) => l.href === pathname)?.label || 'Dashboard'}
            </h2>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-[11px] text-gray-600">15 agents • 4 squads</span>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-auto p-5">
          {children}
        </main>
      </div>
    </div>
  );
}
