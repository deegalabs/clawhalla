import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

export const agents = sqliteTable('agents', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  role: text('role').notNull(),
  tier: integer('tier').notNull(),
  squad: text('squad'),
  model: text('model').notNull(),
  status: text('status').notNull().default('idle'),
  emoji: text('emoji'),
  reportsTo: text('reports_to'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull()
});

export const epics = sqliteTable('epics', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  status: text('status').notNull().default('active'),
  createdBy: text('created_by'),
  approvedBy: text('approved_by'),
  priority: text('priority').default('medium'),
  notes: text('notes'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
  completedAt: integer('completed_at', { mode: 'timestamp' }),
});

export const stories = sqliteTable('stories', {
  id: text('id').primaryKey(),
  epicId: text('epic_id'),
  title: text('title').notNull(),
  status: text('status').notNull().default('backlog'),
  points: integer('points'),
  assignedTo: text('assigned_to'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
  completedAt: integer('completed_at', { mode: 'timestamp' }),
});

export const sprints = sqliteTable('sprints', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  status: text('status').notNull().default('planning'),
  startDate: text('start_date'),
  endDate: text('end_date'),
  storyIds: text('story_ids'), // JSON array
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
});

export const tasks = sqliteTable('tasks', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  description: text('description'),
  status: text('status').notNull().default('backlog'),
  priority: text('priority').notNull().default('medium'),
  assignedTo: text('assigned_to'),
  projectId: text('project_id'),
  storyId: text('story_id'),
  sprintId: text('sprint_id'),
  estimatedHours: integer('estimated_hours'),
  actualHours: integer('actual_hours'),
  tags: text('tags'),
  notes: text('notes'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
  completedAt: integer('completed_at', { mode: 'timestamp' })
});

export const projects = sqliteTable('projects', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description'),
  status: text('status').notNull().default('active'),
  squad: text('squad'),
  startDate: integer('start_date', { mode: 'timestamp' }),
  endDate: integer('end_date', { mode: 'timestamp' }),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull()
});

export const costEvents = sqliteTable('cost_events', {
  id: text('id').primaryKey(),
  agentId: text('agent_id').notNull(),
  model: text('model').notNull(),
  action: text('action').notNull(), // session, task, search, api_call
  inputTokens: integer('input_tokens').notNull().default(0),
  outputTokens: integer('output_tokens').notNull().default(0),
  estimatedCost: integer('estimated_cost_cents').notNull().default(0), // in cents
  taskId: text('task_id'),
  timestamp: integer('timestamp', { mode: 'timestamp' }).notNull(),
});

export const activities = sqliteTable('activities', {
  id: text('id').primaryKey(),
  agentId: text('agent_id').notNull(),
  action: text('action').notNull(),
  target: text('target'),
  details: text('details'),
  timestamp: integer('timestamp', { mode: 'timestamp' }).notNull()
});

export const approvals = sqliteTable('approvals', {
  id: text('id').primaryKey(),
  taskId: text('task_id').notNull(),
  requestedBy: text('requested_by').notNull(),
  approver: text('approver').notNull(),
  status: text('status').notNull().default('pending'),
  command: text('command'),
  reason: text('reason'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  resolvedAt: integer('resolved_at', { mode: 'timestamp' })
});

export const secrets = sqliteTable('secrets', {
  id: text('id').primaryKey(),
  name: text('name').notNull().unique(),
  description: text('description'),
  encryptedValue: text('encrypted_value').notNull(),
  iv: text('iv').notNull(),
  category: text('category').notNull().default('api_key'),
  createdBy: text('created_by').notNull().default('daniel'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
  lastAccessedAt: integer('last_accessed_at', { mode: 'timestamp' }),
});

export const workspaceFiles = sqliteTable('workspace_files', {
  id: text('id').primaryKey(),
  path: text('path').notNull(),
  type: text('type').notNull(),
  size: integer('size'),
  lastModified: integer('last_modified', { mode: 'timestamp' }).notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull()
});

export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value'),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
});
