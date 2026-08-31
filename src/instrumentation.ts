/**
 * Next.js server-startup hook (https://nextjs.org/docs/app/guides/instrumentation).
 * Starts the webhook delivery poller once when the Node server boots — not
 * on the Edge runtime, which has no `better-sqlite3` and no long-lived
 * process to poll from.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { startWebhookDeliveryWorker } = await import("@/lib/webhooks/worker");
  startWebhookDeliveryWorker();
}
