import { getAdminDb } from "./_firebase-admin.js";
import { requireUser, enforceRateLimit, sendError } from "./_auth.js";

// Server-side strike counter. The student's device REPORTS violations; it never
// decides them. Three reported violations auto-disqualify the session right here,
// so a tampered client can no longer send `strikes: 0` and walk away clean.
//
// Rate limit note: a genuinely proctored tab fires at most a handful of these
// (tab blur, devtools, paste...), while a tampering client would need hundreds of
// calls to out-shout the real ones — this limit caps exactly that path.

const MAX_VIOLATIONS = 3;

const REASONS = {
  tab_switch: "Left the exam tab / window",
  window_blur: "Window lost focus",
  fullscreen_exit: "Exited fullscreen",
  devtools: "Developer tools opened",
  paste: "Paste attempt blocked",
  copy: "Copy attempt blocked",
  shortcut: "Blocked shortcut used",
  resize: "Suspicious window resize",
};

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { roomCode, reason } = req.body || {};
  if (!roomCode) {
    return res.status(400).json({ error: "Missing roomCode" });
  }
  const cleanRoomCode = String(roomCode).trim().toUpperCase();
  const cleanReason = REASONS[reason] ? reason : "shortcut";

  let user;
  try {
    user = await requireUser(req);
  } catch (err) {
    return sendError(res, err, "report-violation auth");
  }

  const cleanEmail = String(user.email || "").trim().toLowerCase();
  if (!cleanEmail) {
    return res.status(403).json({ error: "This account has no email address on file" });
  }

  try {
    await enforceRateLimit(`violations_${user.uid}`, {
      limit: 40,
      windowMs: 10 * 60 * 1000,
      label: "violation reports",
    });
  } catch (err) {
    return sendError(res, err, "report-violation rate limit");
  }

  try {
    const db = getAdminDb();

    const sessionId = safeIdLocal(`${cleanRoomCode}_${cleanEmail}`);
    const sessionRef = db.collection("examSessions").doc(sessionId);
    const sessionSnap = await sessionRef.get();

    if (!sessionSnap.exists) {
      return res.status(404).json({ error: "No active exam session — start the exam first" });
    }
    const session = sessionSnap.data();

    if (session.status !== "in-progress") {
      return res.status(400).json({ error: "This exam session is already closed" });
    }
    if (Date.now() > session.deadlineAt) {
      await sessionRef.set({ status: "overtime" }, { merge: true });
      return res.status(400).json({ error: "This exam session has expired. Time is up." });
    }

    // Skip duplicates fired within the same second (blur + visibilitychange
    // often trip together for one user action).
    const log = Array.isArray(session.violationLog) ? session.violationLog : [];
    const last = log[log.length - 1];
    if (last && last.reason === cleanReason && Date.now() - new Date(last.at).getTime() < 1000) {
      return res.status(200).json({ violations: Number(session.violations) || 0, status: session.status });
    }

    const violations = (Number(session.violations) || 0) + 1;
    const status = violations >= MAX_VIOLATIONS ? "disqualified" : "in-progress";

    await sessionRef.set(
      {
        violations,
        status,
        violationLog: [
          ...log,
          { reason: cleanReason, label: REASONS[cleanReason], at: new Date().toISOString() },
        ],
        ...(status === "disqualified" ? { closedAt: new Date().toISOString() } : {}),
      },
      { merge: true }
    );

    return res.status(200).json({ violations, status });
  } catch (err) {
    return sendError(res, err, "report-violation");
  }
}

// Local copy — Firestore doc IDs can't contain "/". Same sanitizer as the other
// API files; kept inline so this file has no import cycle with helpers.
function safeIdLocal(raw) {
  return String(raw).trim().toLowerCase().replace(/[/\\.#$[\]]/g, "_");
}
