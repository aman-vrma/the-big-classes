import { getAdminAuth, getAdminDb } from "./_firebase-admin.js";

// Shared request guards for the /api functions. Underscore-prefixed so Vercel
// does not expose it as its own route.
//
// Every endpoint here is reachable from the open internet with nothing but a
// URL, so each handler must call requireUser() (and usually enforceRateLimit())
// before doing any real work.

const BEARER = /^Bearer\s+(.+)$/i;

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.name = "HttpError";
    this.status = status;
  }
}

/**
 * Verifies the Firebase ID token in the Authorization header and returns its
 * decoded claims ({ uid, email, name, ... }). Throws HttpError(401) otherwise.
 */
export async function requireUser(req) {
  const header = req.headers?.authorization || req.headers?.Authorization || "";
  const match = BEARER.exec(String(header));

  if (!match) {
    throw new HttpError(401, "Missing bearer token — sign in and try again");
  }

  // Separate the two failure modes: an unusable service account is a 500
  // (our problem, worth logging loudly), a bad token is a 401 (their problem).
  let auth;
  try {
    auth = getAdminAuth();
  } catch (err) {
    console.error("Admin SDK init failed:", err?.message || err);
    throw new HttpError(500, "Server auth is unavailable");
  }

  try {
    return await auth.verifyIdToken(match[1].trim());
  } catch (err) {
    console.error("verifyIdToken failed:", err?.message || err);
    throw new HttpError(401, "Your session is invalid or expired — sign in again");
  }
}

/**
 * Fixed-window rate limit backed by Firestore, so the counter is shared across
 * serverless instances and survives cold starts (an in-memory counter would
 * reset on every invocation and would limit nothing).
 *
 * `key` should be a stable per-caller identifier, normally the Firebase uid.
 */
export async function enforceRateLimit(key, { limit, windowMs, label }) {
  const windowStart = Math.floor(Date.now() / windowMs) * windowMs;
  const ref = getAdminDb().collection("rateLimits").doc(`${key}_${windowStart}`);

  // A transaction, not read-then-write: parallel invocations would otherwise
  // each read the same count and all be allowed through.
  const { used, allowed } = await getAdminDb().runTransaction(async (tx) => {
    const snapshot = await tx.get(ref);
    const seen = snapshot.exists ? Number(snapshot.data().count) || 0 : 0;

    if (seen >= limit) return { used: seen, allowed: false };

    tx.set(
      ref,
      {
        count: seen + 1,
        uid: key,
        // Backstop for a Firestore TTL policy on the collection; without one the
        // docs just accumulate harmlessly.
        expireAt: new Date(windowStart + windowMs + 5 * 60 * 1000),
      },
      { merge: true }
    );

    return { used: seen + 1, allowed: true };
  });

  if (!allowed) {
    const secondsLeft = Math.max(
      1,
      Math.ceil((windowStart + windowMs - Date.now()) / 1000)
    );
    const err = new HttpError(
      429,
      `Too many requests — limit is ${limit} per ${Math.round(
        windowMs / 60000
      )} minutes. Try again in ${secondsLeft}s.`
    );
    err.retryAfter = secondsLeft;
    throw err;
  }

  return { used, limit, label };
}

/** Maps a thrown error onto a JSON response without leaking internals. */
export function sendError(res, err, context) {
  const status = err instanceof HttpError ? err.status : 500;

  if (status >= 500) {
    console.error(`[${context}]`, err);
  }
  if (err?.retryAfter) {
    res.setHeader("Retry-After", String(err.retryAfter));
  }

  return res
    .status(status)
    .json({ error: status >= 500 ? "Something went wrong. Please try again." : err.message });
}
