CREATE TABLE IF NOT EXISTS task_runs (
  id TEXT PRIMARY KEY,
  card_id TEXT NOT NULL,
  board_id TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'running',
  prompt TEXT,
  result TEXT,
  error TEXT,
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  estimated_cost_cents INTEGER NOT NULL DEFAULT 0,
  model TEXT,
  duration_ms INTEGER,
  triggered_by TEXT NOT NULL DEFAULT 'manual',
  started_at INTEGER NOT NULL,
  completed_at INTEGER
);
--> statement-breakpoint
CREATE INDEX idx_task_runs_card ON task_runs(card_id);
--> statement-breakpoint
CREATE INDEX idx_task_runs_agent_status ON task_runs(agent_id, status);
--> statement-breakpoint
CREATE INDEX idx_task_runs_status ON task_runs(status);
