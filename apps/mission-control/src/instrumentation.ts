/**
 * Next.js Instrumentation — runs once when the server starts.
 * See: https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 */
export async function register() {
  // Only run on the server (not edge runtime)
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    // Import the publish scheduler to restore any pending scheduled drafts.
    // The module calls restoreScheduledDrafts() on load.
    await import('@/lib/publish-scheduler');
    console.log('[instrumentation] Publish scheduler initialized');
  }
}
