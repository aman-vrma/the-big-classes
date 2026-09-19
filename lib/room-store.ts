import {
  collection,
  doc,
  setDoc,
  getDoc,
  getDocs,
  updateDoc,
  query,
  where,
} from "firebase/firestore";
import { db } from "./firebase";

export type CandidateStatus = "in-progress" | "completed" | "disqualified";

export interface ExamCandidate {
  studentName: string;
  studentEmail?: string;
  roomCode: string;
  status: CandidateStatus;
  violations: number;
  score?: number;
  total?: number;
  percentage?: number;
  /** True when the server's audit found the submission past the deadline. */
  overtime?: boolean;
  /** Minutes past the deadline, set only when overtime is true. */
  overtimeMinutes?: number;
  updatedAt: string;
}

export interface ExamRoom {
  roomCode: string;
  topic: string;
  subject: string;
  createdAt: string;
  durationMinutes: number;
  status: "active" | "closed";
  teacherId?: string;
  questions: {
    id: number;
    question: string;
    options: string[];
    correctAnswer: string;
    explanation: string;
  }[];
}

const ROOMS_COLLECTION = "examRooms";
const CANDIDATES_COLLECTION = "candidates";

// Firestore document IDs can't contain "/" — sanitize just in case.
function safeId(raw: string): string {
  return raw.trim().toLowerCase().replace(/[/\\.#$\[\]]/g, "_");
}

async function attachAnswerKeys(rooms: ExamRoom[]): Promise<ExamRoom[]> {
  await Promise.all(
    rooms.map(async (room) => {
      try {
        const keySnap = await getDoc(doc(db, ROOMS_COLLECTION, room.roomCode.toUpperCase(), "secure", "answerKey"));
        if (keySnap.exists()) {
          const answers = keySnap.data().answers as { id: number; correctAnswer: string; explanation: string }[];
          room.questions = room.questions.map((q, idx) => ({
            ...q,
            correctAnswer: answers[idx]?.correctAnswer ?? "",
            explanation: answers[idx]?.explanation ?? "",
          }));
        }
      } catch {
        // Not our room — leave correctAnswer/explanation blank, that's expected.
      }
    })
  );
  return rooms;
}

export async function getExamRooms(): Promise<ExamRoom[]> {
  const snap = await getDocs(collection(db, ROOMS_COLLECTION));
  const rooms = snap.docs.map((d) => d.data() as ExamRoom);
  await attachAnswerKeys(rooms);
  return rooms.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

// Only this teacher's own rooms — used by the History page so one teacher never
// sees another teacher's exams.
export async function getExamRoomsForTeacher(teacherId: string): Promise<ExamRoom[]> {
  if (!teacherId) return [];
  const q = query(collection(db, ROOMS_COLLECTION), where("teacherId", "==", teacherId));
  const snap = await getDocs(q);
  const rooms = snap.docs.map((d) => d.data() as ExamRoom);
  await attachAnswerKeys(rooms);
  return rooms.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

// Splits the room into a PUBLIC document (topic, options — never the correct answers,
// since students read this to take the exam) and a SECURE sub-document (the answer
// key, readable only by the owning teacher or the server's Admin SDK). This is what
// stops a student from opening DevTools/Network tab and reading every correct answer
// before even starting the exam.
export async function saveExamRoom(room: ExamRoom): Promise<void> {
  const roomCode = room.roomCode.toUpperCase();

  const publicQuestions = room.questions.map(({ id, question, options }) => ({ id, question, options }));
  const answerKey = room.questions.map(({ id, correctAnswer, explanation }) => ({ id, correctAnswer, explanation }));

  await setDoc(doc(db, ROOMS_COLLECTION, roomCode), {
    ...room,
    roomCode,
    questions: publicQuestions,
  });

  await setDoc(doc(db, ROOMS_COLLECTION, roomCode, "secure", "answerKey"), { answers: answerKey });
}

export async function closeExamRoom(code: string): Promise<void> {
  await updateDoc(doc(db, ROOMS_COLLECTION, code.toUpperCase()), { status: "closed" });
}

export async function findExamRoom(code: string): Promise<ExamRoom | undefined> {
  const snap = await getDoc(doc(db, ROOMS_COLLECTION, code.trim().toUpperCase()));
  return snap.exists() ? (snap.data() as ExamRoom) : undefined;
}

export async function getAllCandidates(roomCode?: string): Promise<ExamCandidate[]> {
  let snap;
  if (roomCode) {
    const q = query(collection(db, CANDIDATES_COLLECTION), where("roomCode", "==", roomCode.trim().toUpperCase()));
    snap = await getDocs(q);
  } else {
    snap = await getDocs(collection(db, CANDIDATES_COLLECTION));
  }
  const list = snap.docs.map((d) => d.data() as ExamCandidate);
  return list.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
}

export async function updateCandidateStatus(candidate: ExamCandidate): Promise<void> {
  const identity = candidate.studentEmail || candidate.studentName;
  const docId = safeId(`${candidate.roomCode}_${identity}`);
  await setDoc(
    doc(db, CANDIDATES_COLLECTION, docId),
    { ...candidate, roomCode: candidate.roomCode.toUpperCase(), updatedAt: new Date().toISOString() },
    { merge: true }
  );
}

// Returns true if this email has already completed (or been disqualified from) this specific room's exam.
export async function hasStudentAttempted(email: string, roomCode: string): Promise<boolean> {
  if (!email || !roomCode) return false;
  const candidates = await getAllCandidates(roomCode);
  return candidates.some(
    (c) =>
      (c.studentEmail || "").trim().toLowerCase() === email.trim().toLowerCase() &&
      (c.status === "completed" || c.status === "disqualified")
  );
}

// Returns every exam attempt (across all rooms) made by this email, newest first,
// with the room's topic/subject attached for display.
export async function getCandidateHistory(
  email: string
): Promise<(ExamCandidate & { topic?: string; subject?: string })[]> {
  if (!email) return [];
  const [rooms, all] = await Promise.all([getExamRooms(), getAllCandidates()]);

  return all
    .filter((c) => (c.studentEmail || "").trim().toLowerCase() === email.trim().toLowerCase())
    .map((c) => {
      const room = rooms.find((r) => r.roomCode.trim().toUpperCase() === c.roomCode.trim().toUpperCase());
      return { ...c, topic: room?.topic, subject: room?.subject };
    })
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
}

export async function exportCandidatesToCSV(roomCode?: string): Promise<void> {
  const data = await getAllCandidates(roomCode);
  if (data.length === 0) {
    alert("No student records found to export.");
    return;
  }

  const headers = ["Student Name", "Email", "Room Code", "Status", "Strikes", "Overtime", "Score", "Total", "Percentage", "Time"];
  const rows = data.map((c) => [
    `"${c.studentName}"`,
    `"${c.studentEmail || "N/A"}"`,
    `"${c.roomCode}"`,
    `"${c.status}"`,
    c.violations || 0,
    c.overtime ? `"Yes (+${c.overtimeMinutes || 0}m)"` : "No",
    c.score ?? 0,
    c.total ?? 0,
    `"${c.percentage ?? 0}%"`,
    `"${new Date(c.updatedAt).toLocaleString()}"`,
  ]);

  const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map((e) => e.join(","))].join("\n");
  const encodedUri = encodeURI(csvContent);
  const link = document.createElement("a");
  link.setAttribute("href", encodedUri);
  link.setAttribute("download", `exam_ledger_${roomCode || "all"}_${Date.now()}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}