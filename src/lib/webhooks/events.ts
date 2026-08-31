/**
 * Content event types a webhook can subscribe to, plus the synthetic
 * `webhook.test` ping used for the "send a test ping" action.
 */
export const CONTENT_EVENT_TYPES = [
  "entry.published",
  "entry.unpublished",
  "entry.deleted",
] as const;
export type ContentEventType = (typeof CONTENT_EVENT_TYPES)[number];

export const WEBHOOK_EVENT_TYPES = [...CONTENT_EVENT_TYPES, "webhook.test"] as const;
export type WebhookEventType = (typeof WEBHOOK_EVENT_TYPES)[number];

export function isContentEventType(value: string): value is ContentEventType {
  return (CONTENT_EVENT_TYPES as readonly string[]).includes(value);
}

export type ContentEvent = {
  type: ContentEventType;
  tenantId: string;
  projectId: string;
  collectionId: string;
  entryId: string;
};
