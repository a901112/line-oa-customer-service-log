const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000;

const seen = new Map();

function cleanup(now) {
  for (const [key, expiresAt] of seen.entries()) {
    if (expiresAt <= now) {
      seen.delete(key);
    }
  }
}

export function makeDedupeKey(event) {
  if (event?.webhookEventId) {
    return event.webhookEventId;
  }

  const timestamp = event?.timestamp ?? "no-timestamp";
  const userId = event?.source?.userId ?? "no-user";
  const messageId = event?.message?.id ?? "no-message";
  return `${timestamp}:${userId}:${messageId}`;
}

export function isDuplicate(key, ttlMs = DEFAULT_TTL_MS) {
  const now = Date.now();
  cleanup(now);

  if (seen.has(key)) {
    return true;
  }

  seen.set(key, now + ttlMs);
  return false;
}
