import { getAdminDb } from "./_firebase-admin.js";
import { requireUser, enforceRateLimit, sendError } from "./_auth.js";

// Firestore doc IDs can't contain "/" — same sanitizer as lib/room-store.ts
function safeId(raw) {
  return raw.trim().toLowerCase().replace(/[/\\.#$\[\]]/g, "_");
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { roomCode, studentName, studentEmail, answers, strikes } = req.body || {};

  if (!roomCode || !studentName || !studentEmail) {
    return res.status(400).json({ error: "Missing roomCode, studentName or studentEmail" });
  }

  const cleanRoomCode = String(roomCode).trim().toUpperCase();
  const cleanEmail = String(studentEmail).trim().toLowerCase();

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
  const tokenEmail = String(user.email || "").trim().toLowerCase();
  if (!tokenEmail) {
    return res.status(403).json({ error: "This account has no email address on file" });
  }
  if (tokenEmail !== cleanEmail) {
    return res.status(403).json({ error: "You can only submit your own exam" });
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

    const roomSnap = await db.collection("examRooms").doc(cleanRoomCode).get();
    if (!roomSnap.exists) {
      return res.status(404).json({ error: "Exam room not found" });
    }
    const room = roomSnap.data();

    if (room.status === "closed") {
      return res.status(400).json({ error: "This exam room has been closed by faculty" });
    }

    // Re-check "already attempted" server-side too — a client-side-only check can be
    // bypassed by calling this endpoint directly.
    const candidatesRef = db.collection("candidates");
    const existingSnap = await candidatesRef
      .where("roomCode", "==", cleanRoomCode)
      .where("studentEmail", "==", cleanEmail)
      .get();

    const alreadyDone = existingSnap.docs.some((d) => {
      const status = d.data().status;
      return status === "completed" || status === "disqualified";
    });
    if (alreadyDone) {
      return res.status(400).json({ error: "You have already attempted this exam" });
    }

    // The correct answers live ONLY here, in a subcollection normal clients can never
    // read (see firestore.rules). Only this Admin-SDK-powered function can see them.
    const answerKeySnap = await db
      .collection("examRooms")
      .doc(cleanRoomCode)
      .collection("secure")
      .doc("answerKey")
      .get();

    const answerKey = answerKeySnap.exists ? answerKeySnap.data().answers || [] : [];
    const totalQuestions = answerKey.length;

    let score = 0;
    answerKey.forEach((entry, idx) => {
      const selectedIdx = answers ? answers[idx] : undefined;
      if (selectedIdx === undefined || selectedIdx === null) return;

      const options = room.questions?.[idx]?.options || [];
      const selectedText = options[selectedIdx];

      if (typeof entry.correctAnswer === "string") {
        if (selectedText === entry.correctAnswer) score += 1;
      } else if (typeof entry.correctAnswer === "number") {
        if (selectedIdx === entry.correctAnswer) score += 1;
      }
    });

    const strikeCount = Number(strikes) || 0;
    const status = strikeCount >= 3 ? "disqualified" : "completed";
    const percentage = totalQuestions > 0 ? Math.round((score / totalQuestions) * 100) : 0;

    const docId = safeId(`${cleanRoomCode}_${cleanEmail || studentName}`);
    await candidatesRef.doc(docId).set(
      {
        studentName: String(studentName).trim(),
        studentEmail: cleanEmail,
        roomCode: cleanRoomCode,
        status,
        violations: strikeCount,
        score,
        total: totalQuestions,
        percentage,
        updatedAt: new Date().toISOString(),
      },
      { merge: true }
    );

    return res.status(200).json({ score, total: totalQuestions, percentage, status });
  } catch (err) {
    return sendError(res, err, "grade-exam");
  }
}