import { getAdminDb } from "./_firebase-admin.js";
import { requireUser, enforceRateLimit, sendError } from "./_auth.js";

// Starts (or resumes) a server-owned exam session for this student.
//
// The server, not the browser, owns three things from here on:
//   1. The question order (shuffled per student, so screens can't be compared).
//   2. The deadline (startedAt / durationMinutes live in Firestore, so a laptop
//      clock change or a refresh doesn't create extra time).
//   3. The strike counter (report-violation.js increments it; the student's own
//      device is never trusted for it).
//
// The response only contains public question data (question + options), never
// the answers — those stay in the secure subdocument used by grade-exam.js.

function safeId(raw) {
  return String(raw).trim().toLowerCase().replace(/[/\\.#$[\]]/g, "_");
}

// Deterministic Fisher-Yates: seeded by session identity so a refresh resumes
// the SAME order instead of reshuffling. Without this, a student could refresh,
// note that the order changed, and use it to identify questions across devices.
function shuffleSeeded(items, seed) {
  const arr = items.slice();
  // xmur3-style string hash → 32-bit seed
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  const rand = () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { roomCode } = req.body || {};
  if (!roomCode) {
    return res.status(400).json({ error: "Missing roomCode" });
  }
  const cleanRoomCode = String(roomCode).trim().toUpperCase();

  let user;
  try {
    user = await requireUser(req);
  } catch (err) {
    return sendError(res, err, "exam-session auth");
  }

  const cleanEmail = String(user.email || "").trim().toLowerCase();
  if (!cleanEmail) {
    return res.status(403).json({ error: "This account has no email address on file" });
  }

  try {
    await enforceRateLimit(`session_${user.uid}`, {
      limit: 30,
      windowMs: 10 * 60 * 1000,
      label: "session starts",
    });
  } catch (err) {
    return sendError(res, err, "exam-session rate limit");
  }

  try {
    const db = getAdminDb();

    const roomSnap = await db.collection("examRooms").doc(cleanRoomCode).get();
    if (!roomSnap.exists) {
      return res.status(404).json({ error: "Exam room not found" });
    }
    const room = roomSnap.data();

    if (room.status === "closed") {
      return res.status(400).json({ error: "This exam room has been closed by faculty" });
    }

    const questions = Array.isArray(room.questions) ? room.questions : [];
    if (questions.length === 0) {
      return res.status(400).json({ error: "This exam room contains no active questions" });
    }

    // One session per (room, student). Doc ID is deterministic, so this is also
    // the natural single-attempt lock: every submit overwrites the same session.
    const sessionId = safeId(`${cleanRoomCode}_${cleanEmail}`);
    const sessionRef = db.collection("examSessions").doc(sessionId);
    const sessionSnap = await sessionRef.get();

    const now = Date.now();
    const durationMs = Math.max(1, Number(room.durationMinutes) || 10) * 60 * 1000;

    if (sessionSnap.exists()) {
      const session = sessionSnap.data();

      if (session.status === "completed" || session.status === "disqualified") {
        return res.status(400).json({
          error:
            session.status === "disqualified"
              ? "You were disqualified from this exam (3 strikes). Please contact your faculty member."
              : "You have already attempted this exam",
        });
      }

      // Overtime guard: the deadline lives here, not in the browser. Even a
      // refreshed tab resumes the original countdown, never a fresh timer.
      if (now > session.deadlineAt) {
        await sessionRef.set(
          { status: "overtime", closedAt: new Date().toISOString() },
          { merge: true }
        );
        return res.status(400).json({ error: "This exam session has expired. Time is up." });
      }

      // Resume: same order, same deadline, strikes intact.
      return res.status(200).json({
        sessionId,
        resumed: true,
        questions: session.orderedQuestions,
        deadlineAt: session.deadlineAt,
        serverNow: now,
        violations: Number(session.violations) || 0,
        topic: room.topic || "",
      });
    }

    // Fresh session: shuffle question order deterministically for this student.
    const seed = `${sessionId}_${room.createdAt || ""}`;
    const shuffled = shuffleSeeded(questions, seed).map((q, idx) => ({
      id: q.id ?? idx + 1,
      question: String(q.question || ""),
      options: Array.isArray(q.options) ? q.options.map(String) : [],
    }));

    const startedAt = now;
    const deadlineAt = startedAt + durationMs;

    await sessionRef.set({
      sessionId,
      roomCode: cleanRoomCode,
      studentEmail: cleanEmail,
      studentName: String(user.name || cleanEmail).trim(),
      teacherId: room.teacherId || "",
      // Server-side order: grading uses THIS, not the display order. The student
      // sees shuffled order; the mapping back to the answer key stays here.
      orderedQuestions: shuffled,
      startedAt,
      deadlineAt,
      durationMinutes: Math.round(durationMs / 60000),
      violations: 0,
      violationLog: [],
      status: "in-progress",
      createdAt: new Date().toISOString(),
    });

    return res.status(200).json({
      sessionId,
      resumed: false,
      questions: shuffled,
      deadlineAt,
      serverNow: now,
      violations: 0,
      topic: room.topic || "",
    });
  } catch (err) {
    return sendError(res, err, "exam-session");
  }
}
