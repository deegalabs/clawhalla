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

// ---------------------------------------------------------------------------
// Boards Engine — generic project management (Trello/Linear-style)
// ---------------------------------------------------------------------------

export const boards = sqliteTable('boards', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description'),
  type: text('type').notNull().default('kanban'), // kanban | sprint | custom
  columns: text('columns').notNull(), // JSON array of { id, name, color?, wipLimit? }
  owner: text('owner').notNull().default('user'), // 'user' | agent_id
  squad: text('squad'), // optional squad association
  settings: text('settings'), // JSON — sprint dates, WIP limits, etc.
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
  archivedAt: integer('archived_at', { mode: 'timestamp' }),
});

export const cards = sqliteTable('cards', {
  id: text('id').primaryKey(),
  boardId: text('board_id').notNull(),
  title: text('title').notNull(),
  description: text('description'),
  column: text('column').notNull(), // matches column id from board.columns
  position: integer('position').notNull().default(0), // order within column
  assignee: text('assignee'), // agent_id | 'user'
  labels: text('labels'), // JSON array of strings
  priority: text('priority').default('medium'), // low | medium | high | urgent
  dueDate: integer('due_date', { mode: 'timestamp' }),
  checklist: text('checklist'), // JSON array of { text, checked }
  attachments: text('attachments'), // JSON array of { name, url }
  parentCardId: text('parent_card_id'), // for sub-tasks
  storyId: text('story_id'), // link to stories table (optional)
  epicId: text('epic_id'), // link to epics table (optional)
  sprintId: text('sprint_id'), // link to sprints table (optional)
  progress: integer('progress').default(0), // 0-100
  createdBy: text('created_by').notNull().default('user'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
  completedAt: integer('completed_at', { mode: 'timestamp' }),
  archivedAt: integer('archived_at', { mode: 'timestamp' }),
});

export const cardComments = sqliteTable('card_comments', {
  id: text('id').primaryKey(),
  cardId: text('card_id').notNull(),
  author: text('author').notNull(), // agent_id | 'user'
  content: text('content').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
});

export const cardHistory = sqliteTable('card_history', {
  id: text('id').primaryKey(),
  cardId: text('card_id').notNull(),
  action: text('action').notNull(), // created | moved | assigned | commented | updated | archived
  by: text('by').notNull(), // agent_id | 'user'
  fromValue: text('from_value'),
  toValue: text('to_value'),
  timestamp: integer('timestamp', { mode: 'timestamp' }).notNull(),
});

// ---------------------------------------------------------------------------
// Chat Engine — persistent chat sessions and messages
// ---------------------------------------------------------------------------

export const chatSessions = sqliteTable('chat_sessions', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  agentId: text('agent_id').notNull(), // primary agent or 'party'
  mode: text('mode').notNull().default('single'), // single | party
  participants: text('participants'), // JSON array of agent IDs (party mode)
  model: text('model'), // model tier used
  messageCount: integer('message_count').notNull().default(0),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
  archivedAt: integer('archived_at', { mode: 'timestamp' }),
});

export const chatMessages = sqliteTable('chat_messages', {
  id: text('id').primaryKey(),
  sessionId: text('session_id').notNull(),
  role: text('role').notNull(), // user | agent | system
  agentId: text('agent_id'), // which agent responded (null for user/system)
  content: text('content').notNull(),
  toolCalls: text('tool_calls'), // JSON array of { name, input, output } for tool use rendering
  thinkingContent: text('thinking_content'), // extended thinking block
  artifacts: text('artifacts'), // JSON array of { type, title, content }
  attachments: text('attachments'), // JSON array of { name, type, url }
  model: text('model'), // model used for this response
  inputTokens: integer('input_tokens'),
  outputTokens: integer('output_tokens'),
  durationMs: integer('duration_ms'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
});

// ---------------------------------------------------------------------------
// Content Engine — drafts and pipelines
// ---------------------------------------------------------------------------

export const contentDrafts = sqliteTable('content_drafts', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  content: text('content').notNull(),
  platform: text('platform').notNull(), // linkedin | twitter | instagram | blog | newsletter
  status: text('status').notNull().default('draft'), // draft | approved | scheduled | published
  hashtags: text('hashtags'), // comma-separated
  mediaUrl: text('media_url'),
  scheduledAt: integer('scheduled_at', { mode: 'timestamp' }),
  publishedAt: integer('published_at', { mode: 'timestamp' }),
  agentId: text('agent_id'), // which agent created it
  pipelineId: text('pipeline_id'), // link to content pipeline
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
});

// ---------------------------------------------------------------------------
// Notification Engine — persistent notifications
// ---------------------------------------------------------------------------

export const notifications = sqliteTable('notifications', {
  id: text('id').primaryKey(),
  type: text('type').notNull(), // chat | approval | task | agent | system | autopilot
  title: text('title').notNull(),
  body: text('body').notNull(),
  icon: text('icon'), // emoji
  href: text('href'), // navigation target
  agentId: text('agent_id'),
  priority: text('priority').notNull().default('normal'), // low | normal | high | urgent
  read: integer('read').notNull().default(0), // 0 = unread, 1 = read
  dismissed: integer('dismissed').notNull().default(0),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
});

// ---------------------------------------------------------------------------
// Autopilot Engine — goals and autonomous run history
// ---------------------------------------------------------------------------

export const autopilotGoals = sqliteTable('autopilot_goals', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  description: text('description').notNull().default(''),
  priority: text('priority').notNull().default('high'), // critical | high | medium | low
  status: text('status').notNull().default('active'), // active | achieved | paused
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
});

export const autopilotRuns = sqliteTable('autopilot_runs', {
  id: text('id').primaryKey(),
  goalId: text('goal_id'),
  agentId: text('agent_id').notNull(),
  taskTitle: text('task_title').notNull().default(''),
  taskDescription: text('task_description'),
  status: text('status').notNull().default('pending'), // pending | running | done | failed | rejected
  result: text('result'),
  feedback: text('feedback'), // approved | rejected | adjusted
  feedbackNote: text('feedback_note'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
});

export const contentPipelines = sqliteTable('content_pipelines', {
  id: text('id').primaryKey(),
  platform: text('platform').notNull(),
  topic: text('topic').notNull(),
  status: text('status').notNull().default('active'), // active | paused | done | cancelled
  currentStep: integer('current_step').notNull().default(0),
  steps: text('steps').notNull(), // JSON array of pipeline steps with status/output
  finalText: text('final_text'),
  finalHashtags: text('final_hashtags'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
});
