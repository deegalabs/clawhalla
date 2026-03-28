'use client';

import { useState, useEffect, useCallback } from 'react';
import { fetchAgents, invalidateAgentsCache, type AgentInfo } from '@/lib/agents';

/**
 * Hook to get the agent roster from DB (via /api/agents/health).
 * Returns the list of agents, a refresh function, and loading state.
 * Data is cached globally — multiple components share one fetch.
 */
export function useAgents() {
  const [agents, setAgents] = useState<AgentInfo[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    invalidateAgentsCache();
    const data = await fetchAgents();
    setAgents(data);
  }, []);

  useEffect(() => {
    fetchAgents().then(data => {
      setAgents(data);
      setLoading(false);
    });
  }, []);

  return { agents, loading, refresh };
}
