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
  /** Server-stamped: owning teacher's uid — Firestore rules key scoped reads on this. */
  teacherId?: string;
  /** Server-stamped exam labels so student history needs no examRooms read. */
  topic?: string;
  subject?: string;
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

// Only this teacher's own rooms — used by the History page so one teacher never
// sees another teacher's exams. The old getExamRooms() (a whole-collection scan)
// is gone: Firestore rules now only permit scoped queries, never full scans.
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
}// Attempts for rooms THIS teacher owns. The rules key this on the server-stamped
// teacherId field; querying on it also keeps the query rule-compliant (no scans).
export async function getAllCandidates(teacherId: string, roomCode?: string): Promise<ExamCandidate[]> {
  if (!teacherId) return [];
  let q = query(
    collection(db, CANDIDATES_COLLECTION),
    where("teacherId", "==", teacherId)
  );
  if (roomCode) {
    q = query(q, where("roomCode", "==", roomCode.trim().toUpperCase()));
  }
  const snap = await getDocs(q);
  const list = snap.docs.map((d) => d.data() as ExamCandidate);
  return list.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
}

// This student's own attempts, newest first. The server stamps studentEmailLower
// on every attempt, and the rules only let you read rows matching your own token
// email — so this query is also the rule-compliant path (no scans, no others' data).
export async function getCandidateHistory(
  email: string
): Promise<ExamCandidate[]> {
  if (!email) return [];
  const q = query(
    collection(db, CANDIDATES_COLLECTION),
    where("studentEmailLower", "==", email.trim().toLowerCase())
  );
  const snap = await getDocs(q);
  const list = snap.docs.map((d) => d.data() as ExamCandidate);
  return list.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
}

export async function exportCandidatesToCSV(teacherId: string, roomCode?: string): Promise<void> {
  const data = await getAllCandidates(teacherId, roomCode);
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