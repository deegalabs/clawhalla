// Pre-built board templates users can choose from

export interface BoardTemplate {
  id: string;
  name: string;
  description: string;
  type: 'kanban' | 'sprint' | 'custom';
  columns: { id: string; name: string; color?: string; wipLimit?: number }[];
}

export const boardTemplates: BoardTemplate[] = [
  {
    id: 'kanban',
    name: 'Kanban',
    description: 'Simple kanban board with 4 columns',
    type: 'kanban',
    columns: [
      { id: 'backlog', name: 'Backlog', color: '#6b7280' },
      { id: 'todo', name: 'To Do', color: '#3b82f6' },
      { id: 'doing', name: 'In Progress', color: '#f59e0b', wipLimit: 3 },
      { id: 'done', name: 'Done', color: '#22c55e' },
    ],
  },
  {
    id: 'sprint',
    name: 'Sprint Board',
    description: 'Scrum sprint board with testing phase',
    type: 'sprint',
    columns: [
      { id: 'sprint-backlog', name: 'Sprint Backlog', color: '#6b7280' },
      { id: 'doing', name: 'Doing', color: '#3b82f6', wipLimit: 2 },
      { id: 'testing', name: 'Testing', color: '#f59e0b' },
      { id: 'review', name: 'Review', color: '#a855f7' },
      { id: 'deployed', name: 'Deployed', color: '#22c55e' },
    ],
  },
  {
    id: 'content',
    name: 'Content Pipeline',
    description: 'Content creation workflow from idea to publish',
    type: 'kanban',
    columns: [
      { id: 'ideas', name: 'Ideas', color: '#6b7280' },
      { id: 'researching', name: 'Researching', color: '#3b82f6' },
      { id: 'writing', name: 'Writing', color: '#f59e0b' },
      { id: 'review', name: 'Review', color: '#a855f7' },
      { id: 'published', name: 'Published', color: '#22c55e' },
    ],
  },
  {
    id: 'support',
    name: 'Support Queue',
    description: 'Track support tickets and issues',
    type: 'kanban',
    columns: [
      { id: 'reported', name: 'Reported', color: '#ef4444' },
      { id: 'triaged', name: 'Triaged', color: '#f59e0b' },
      { id: 'fixing', name: 'Fixing', color: '#3b82f6' },
      { id: 'testing', name: 'Testing', color: '#a855f7' },
      { id: 'resolved', name: 'Resolved', color: '#22c55e' },
    ],
  },
  {
    id: 'project',
    name: 'Project Management',
    description: 'Full project lifecycle tracking',
    type: 'kanban',
    columns: [
      { id: 'planning', name: 'Planning', color: '#6b7280' },
      { id: 'active', name: 'Active', color: '#3b82f6' },
      { id: 'blocked', name: 'Blocked', color: '#ef4444' },
      { id: 'review', name: 'Review', color: '#a855f7' },
      { id: 'done', name: 'Done', color: '#22c55e' },
    ],
  },
  {
    id: 'blank',
    name: 'Blank Board',
    description: 'Start with a clean board and add your own columns',
    type: 'custom',
    columns: [
      { id: 'col-1', name: 'To Do', color: '#3b82f6' },
      { id: 'col-2', name: 'Done', color: '#22c55e' },
    ],
  },
];
