import { workspaceWatcher } from '@/lib/watcher';
import { subscribeBoardEvents, subscribeNotifications } from '@/lib/events';

export const dynamic = 'force-dynamic';

export async function GET() {
  // Initialize watcher on first SSE connection
  workspaceWatcher.init();

  const encoder = new TextEncoder();
  let unsubFile: (() => void) | null = null;
  let unsubBoard: (() => void) | null = null;
  let unsubNotif: (() => void) | null = null;

  const stream = new ReadableStream({
    start(controller) {
      const send = (payload: unknown) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
        } catch { /* stream closed */ }
      };

      // Send initial ping
      send({ type: 'connected', timestamp: Date.now() });

      // Subscribe to file events
      unsubFile = workspaceWatcher.subscribe((event) => {
        send({
          type: 'file_change',
          event: {
            type: event.type,
            path: event.relativePath,
            timestamp: event.timestamp,
          },
        });
      });

      // Subscribe to board events (cards moved, created, commented, etc.)
      unsubBoard = subscribeBoardEvents((event) => {
        send({ type: 'board_event', event });
      });

      // Subscribe to notification events
      unsubNotif = subscribeNotifications((event) => {
        send({ type: 'notification', event });
      });

      // Heartbeat every 30s to keep connection alive
      const heartbeat = setInterval(() => {
        send({ type: 'ping', timestamp: Date.now() });
      }, 30000);

      // Cleanup heartbeat when stream closes
      const origCancel = stream.cancel;
      stream.cancel = (reason) => {
        clearInterval(heartbeat);
        return origCancel?.call(stream, reason);
      };
    },
    cancel() {
      if (unsubFile) unsubFile();
      if (unsubBoard) unsubBoard();
      if (unsubNotif) unsubNotif();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}
