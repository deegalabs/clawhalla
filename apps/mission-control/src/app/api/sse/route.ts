import { workspaceWatcher } from '@/lib/watcher';

export const dynamic = 'force-dynamic';

export async function GET() {
  // Initialize watcher on first SSE connection
  workspaceWatcher.init();

  const encoder = new TextEncoder();
  let unsubscribe: (() => void) | null = null;

  const stream = new ReadableStream({
    start(controller) {
      // Send initial ping
      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'connected', timestamp: Date.now() })}\n\n`));

      // Subscribe to file events
      unsubscribe = workspaceWatcher.subscribe((event) => {
        try {
          const data = JSON.stringify({
            type: 'file_change',
            event: {
              type: event.type,
              path: event.relativePath,
              timestamp: event.timestamp,
            },
          });
          controller.enqueue(encoder.encode(`data: ${data}\n\n`));
        } catch {
          // Stream closed
        }
      });

      // Heartbeat every 30s to keep connection alive
      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'ping', timestamp: Date.now() })}\n\n`));
        } catch {
          clearInterval(heartbeat);
        }
      }, 30000);
    },
    cancel() {
      if (unsubscribe) unsubscribe();
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
