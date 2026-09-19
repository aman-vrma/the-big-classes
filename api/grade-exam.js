import { getAdminDb } from "./_firebase-admin.js";
import { requireUser, enforceRateLimit, sendError } from "./_auth.js";

// Grades an exam against the SERVER-OWNED session, not anything the client says.
//
// What the client sends:  its chosen options, mapped to the SHUFFLED order the
//                         server gave it (so options align with the key server-side).
// What the server decides: the question order, the deadline, the strike count,
//                          and therefore the final score and status.
//
// A tampered client can no longer: claim zero strikes, submit after the deadline,
// answer questions it never received, or share a single "answer order" with a
// friend (each session has its own shuffled order).

// Firestore doc IDs can't contain "/" — same sanitizer as lib/room-store.ts
function safeId(raw) {
  return String(raw).trim().toLowerCase().replace(/[/\.#$[\]]/g, "_");
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { roomCode, answers } = req.body || {};

  if (!roomCode) {
    return res.status(400).json({ error: "Missing roomCode" });
  }
  const cleanRoomCode = String(roomCode).trim().toUpperCase();

  if (answers != null && !Array.isArray(answers)) {
    return res.status(400).json({ error: "answers must be an array" });
  }

  // This function runs on the Admin SDK, so it bypasses Firestore rules entirely.
  // Without a verified token anyone could submit on a classmate's behalf.
  let user;
  try {
    user = await requireUser(req);
  } catch (err) {
    return sendError(res, err, "grade-exam auth");
  }

  // The token's email is authoritative: you may only submit your own exam.
  const cleanEmail = String(user.email || "").trim().toLowerCase();
  if (!cleanEmail) {
    return res.status(403).json({ error: "This account has no email address on file" });
  }

  try {
    await enforceRateLimit(`exam_${user.uid}`, {
      limit: 10,
      windowMs: 10 * 60 * 1000,
      label: "submissions",
    });
  } catch (err) {
    return sendError(res, err, "grade-exam rate limit");
  }

  try {
    const db = getAdminDb();

    // 1. Load the server-owned session — the single source of truth.
    const sessionId = safeId(`${cleanRoomCode}_${cleanEmail}`);
    const sessionRef = db.collection("examSessions").doc(sessionId);
    const sessionSnap = await sessionRef.get();

    if (!sessionSnap.exists) {
      return res.status(400).json({ error: "No exam session found for this room. Start the exam first." });
    }
    const session = sessionSnap.data();

    if (session.status === "completed") {
      return res.status(400).json({ error: "You have already submitted this exam" });
    }
    if (session.status === "disqualified") {
      return res.status(400).json({ error: "You were disqualified from this exam (3 strikes)" });
    }

    // 2. Overtime audit: was the submission on time by the SERVER's clock?
    //    A small network grace period absorbs honest latency.
    const submittedAt = Date.now();
    const GRACE_MS = 15 * 1000;
    const overtime = submittedAt > session.deadlineAt + GRACE_MS;
    const overtimeMs = overtime ? submittedAt - session.deadlineAt : 0;

    const roomSnap = await db.collection("examRooms").doc(cleanRoomCode).get();
    const room = roomSnap.exists ? roomSnap.data() : null;

    if (room && room.status === "closed") {
      return res.status(400).json({ error: "This exam room has been closed by faculty" });
    }

    // 3. Grade against the key, using the SERVER's question order. The client's
    //    answers[] array is indexed in the shuffled order it was given.
    const keySnap = await db
      .collection("examRooms")
      .doc(cleanRoomCode)
      .collection("secure")
      .doc("answerKey")
      .get();

    const answerKey = keySnap.exists ? keySnap.data().answers || [] : [];
    const ordered = Array.isArray(session.orderedQuestions) ? session.orderedQuestions : [];
    const totalQuestions = ordered.length;

    // Map each ordered question back to its original index in the answer key.
    const originalIndexOf = new Map();
    (room?.questions || []).forEach((q, idx) => {
      if (q && q.id !== undefined) originalIndexOf.set(String(q.id), idx);
    });

    let score = 0;
    ordered.forEach((sq, pos) => {
      const selectedIdx = answers ? answers[pos] : undefined;
      if (selectedIdx === undefined || selectedIdx === null) return;

      const origIdx = originalIndexOf.has(String(sq.id)) ? originalIndexOf.get(String(sq.id)) : pos;
      const keyEntry = answerKey[origIdx];
      if (!keyEntry) return;

      const options = Array.isArray(sq.options) ? sq.options : [];
      const selectedText = options[selectedIdx];

      if (typeof keyEntry.correctAnswer === "string") {
        if (selectedText === keyEntry.correctAnswer) score += 1;
      } else if (typeof keyEntry.correctAnswer === "number") {
        if (selectedIdx === keyEntry.correctAnswer) score += 1;
      }
    });

    // 4. Status comes from the SERVER's strike counter. Overtime counts as a
    //    violation of exam rules, not an automatic pass.
    const violations = Number(session.violations) || 0;
    const status = violations >= 3 || overtime ? "disqualified" : "completed";
    const percentage = totalQuestions > 0 ? Math.round((score / totalQuestions) * 100) : 0;

    await sessionRef.set(
      {
        status,
        closedAt: new Date().toISOString(),
        score,
        total: totalQuestions,
        percentage,
        overtime,
        overtimeMs,
      },
      { merge: true }
    );

    // 5. Mirror into candidates/ for the teacher's existing dashboards, CSV and
    //    history pages. Besides the UI fields, the server stamps the three
    //    fields Firestore rules key scoped reads on:
    //      teacherId          -> the owning teacher may read this attempt
    //      studentEmailLower  -> the student may read their own attempt
    //      topic / subject    -> student history labels without reading examRooms
    const candidatesRef = db.collection("candidates");
    const docId = safeId(`${cleanRoomCode}_${cleanEmail}`);
    await candidatesRef.doc(docId).set(
      {
        studentName: String(session.studentName || user.name || cleanEmail).trim(),
        studentEmail: cleanEmail,
        studentEmailLower: cleanEmail,
        roomCode: cleanRoomCode,
        teacherId: String(room?.teacherId || session.teacherId || ""),
        topic: String(room?.topic || ""),
        subject: String(room?.subject || ""),
        status,
        violations,
        score,
        total: totalQuestions,
        percentage,
        overtime,
        overtimeMinutes: Math.round(overtimeMs / 60000),
        updatedAt: new Date().toISOString(),
      },
      { merge: true }
    );

    return res.status(200).json({
      score,
      total: totalQuestions,
      percentage,
      status,
      overtime,
    });
  } catch (err) {
    return sendError(res, err, "grade-exam");
  }
}
