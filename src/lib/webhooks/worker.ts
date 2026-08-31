import { deliverDueWebhooks } from "./delivery";

const POLL_INTERVAL_MS = 5_000;

let started = false;

/**
 * Starts the in-process delivery poller.
 *
 * No queue/job infrastructure exists in this stack (design.md, "Delivery
 * worker"), so this polls `webhook_deliveries` on an interval from within
 * the Node server process itself. Idempotent — safe to call more than once
 * (e.g. across hot reloads in development); only the first call takes
 * effect.
 */
export function startWebhookDeliveryWorker(): void {
  if (started) return;
  started = true;

  const tick = async () => {
    try {
      await deliverDueWebhooks();
    } catch (error) {
      console.error("Webhook delivery poll failed:", error);
    }
  };

  const timer = setInterval(tick, POLL_INTERVAL_MS);
  timer.unref?.();
}
