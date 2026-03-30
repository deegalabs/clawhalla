'use client';

import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { SQUADS } from '@/lib/squads';
import type { SquadDefinition } from '@/lib/squads';

const SQUADS_BY_ID: Record<string, SquadDefinition> =
  Object.fromEntries(SQUADS.map(s => [s.id, s]));

export interface SquadInfo {
  id: string;
  emoji: string;
  label: string;
}

export interface SquadContextValue {
  squads: SquadInfo[];
  activeSquad: string | null;
  activeSquadDef: SquadDefinition | null;
  switchSquad: (id: string) => void;
}

export const SquadContext = createContext<SquadContextValue>({
  squads: [],
  activeSquad: null,
  activeSquadDef: null,
  switchSquad: () => {},
});

export function useSquad() {
  return useContext(SquadContext);
}

/** Fetches squad list from health endpoint and manages active squad state. */
export function useSquadProvider(): SquadContextValue {
  const [squads, setSquads] = useState<SquadInfo[]>([]);
  const [activeSquad, setActiveSquad] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/agents/health');
        const data = await res.json();
        if (!data.ok) return;

        const seen = new Set<string>();
        const found: SquadInfo[] = [];
        for (const agent of data.agents || []) {
          if (agent.squad && !seen.has(agent.squad)) {
            seen.add(agent.squad);
            const def = SQUADS_BY_ID[agent.squad];
            found.push({
              id: agent.squad,
              emoji: def?.emoji || '📦',
              label: def?.name || agent.squad,
            });
          }
        }
        setSquads(found);

        if (found.length > 0) {
          const saved = localStorage.getItem('mc_active_squad');
          const valid = found.find(s => s.id === saved);
          setActiveSquad(valid ? valid.id : found[0].id);
        }
      } catch { /* ignore */ }
    })();
  }, []);

  const switchSquad = useCallback((squadId: string) => {
    setActiveSquad(squadId);
    localStorage.setItem('mc_active_squad', squadId);
  }, []);

  const activeSquadDef = activeSquad ? SQUADS_BY_ID[activeSquad] || null : null;

  return { squads, activeSquad, activeSquadDef, switchSquad };
}
