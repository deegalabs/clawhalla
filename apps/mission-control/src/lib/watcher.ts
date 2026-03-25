import { watch } from 'chokidar';
import { join, extname } from 'path';
import { searchIndex } from './search';

const WORKSPACE = process.env.WORKSPACE_PATH || join(process.env.HOME || '/home/clawdbot', '.openclaw/workspace');
const INDEXABLE_EXTS = new Set(['.md', '.yaml', '.yml']);

export interface FileEvent {
  type: 'created' | 'updated' | 'deleted';
  path: string;
  relativePath: string;
  timestamp: number;
}

type EventListener = (event: FileEvent) => void;

class WorkspaceWatcher {
  private listeners = new Set<EventListener>();
  private initialized = false;

  init() {
    if (this.initialized) return;
    this.initialized = true;

    const watchPaths = [
      join(WORKSPACE, 'company/org_structure.yaml'),
      join(WORKSPACE, 'projects/clawhalla/board'),
      join(WORKSPACE, 'memory'),
      join(WORKSPACE, 'company/knowledge_base'),
    ];

    const watcher = watch(watchPaths, {
      ignoreInitial: true,
      persistent: true,
      awaitWriteFinish: { stabilityThreshold: 500, pollInterval: 100 },
    });

    watcher.on('add', (path) => { this.emit('created', path); this.reindex(path); });
    watcher.on('change', (path) => { this.emit('updated', path); this.reindex(path); });
    watcher.on('unlink', (path) => { this.emit('deleted', path); this.deindex(path); });
  }

  private emit(type: FileEvent['type'], fullPath: string) {
    const relativePath = fullPath.replace(WORKSPACE + '/', '');
    const event: FileEvent = {
      type,
      path: fullPath,
      relativePath,
      timestamp: Date.now(),
    };
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch {
        // Don't let one listener crash others
      }
    }
  }

  private reindex(fullPath: string) {
    if (INDEXABLE_EXTS.has(extname(fullPath).toLowerCase())) {
      searchIndex.indexFile(fullPath).catch(() => {});
    }
  }

  private deindex(fullPath: string) {
    if (INDEXABLE_EXTS.has(extname(fullPath).toLowerCase())) {
      const relativePath = fullPath.replace(WORKSPACE + '/', '');
      searchIndex.removeFile(relativePath);
    }
  }

  subscribe(listener: EventListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}

// Singleton
export const workspaceWatcher = new WorkspaceWatcher();
