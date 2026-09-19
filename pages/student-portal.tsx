import { useState, useEffect, useRef, useCallback } from "react";
import { useProctor } from "../hooks/use-proctor";
import { useAuth } from "../lib/auth-context";
import { getAuthHeaders } from "../lib/firebase";
import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { 
  ShieldCheck, 
  Clock, 
  AlertTriangle, 
  Download, 
  Award, 
  Mail,
  User,
  Hash,
  ArrowLeft,
  Loader2
} from "lucide-react";

interface QuestionItem {
  id?: number | string;
  question: string;
  options: string[];
  correctAnswer?: string | number;
}

export function StudentPortal() {
  const [examPin, setExamPin] = useState("");
  const { user } = useAuth();
  const studentName = user?.name || "";
  const studentEmail = user?.email || "";
  
  const [examStarted, setExamStarted] = useState(false);
  const [examSubmitted, setExamSubmitted] = useState(false);
  const [pinError, setPinError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [startingExam, setStartingExam] = useState(false);

  const [activeQuestions, setActiveQuestions] = useState<QuestionItem[]>([]);
  const [quizTitle, setQuizTitle] = useState("Proctored Examination");

  const [currentQuestionIdx, setCurrentQuestionIdx] = useState(0);
  const [selectedAnswers, setSelectedAnswers] = useState<{ [key: number]: number }>({});
  const [timeLeft, setTimeLeft] = useState(600);
  const [score, setScore] = useState(0);

  // The authoritative deadline (server epoch ms). The visible countdown derives
  // from this, never from an independent browser timer.
  const deadlineRef = useRef<number | null>(null);

  // Refs so the proctor's onAutoSubmit callback (created once) always sees the latest
  // answers without us having to rebuild the listeners on every keystroke.
  const selectedAnswersRef = useRef(selectedAnswers);
  useEffect(() => { selectedAnswersRef.current = selectedAnswers; }, [selectedAnswers]);

  const handleAutoSubmit = useCallback(() => {
    triggerFinalSubmit(selectedAnswersRef.current);
  }, []);

  const {
    violations: strikes,
    resetViolations,
    enterFullscreen,
    exitFullscreen,
  } = useProctor({
    maxViolations: 3,
    enabled: examStarted && !examSubmitted,
    onAutoSubmit: handleAutoSubmit,
    roomCode: examPin.trim().toUpperCase(),
  });

  const handleStartExam = async (e: React.FormEvent) => {
    e.preventDefault();
    setPinError("");

    const cleanPin = examPin.trim().toUpperCase();

    if (!studentName.trim() || !studentEmail.trim() || !cleanPin) {
      setPinError("Please enter your name, email, and the 6-digit room PIN.");
      return;
    }

    setStartingExam(true);
    try {
      // The SERVER starts the session: it records the deadline, shuffles the
      // question order for this student, and owns the strike counter from here on.
      const authHeaders = await getAuthHeaders();
      const res = await fetch("/api/exam-session", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders },
        body: JSON.stringify({ roomCode: cleanPin }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Could not start the exam");

      setActiveQuestions(data.questions || []);
      setQuizTitle(data.topic || "Proctored Examination");
      // The countdown mirrors the server's deadline (minus network delay) — a
      // laptop clock change can no longer buy extra time.
      const remainingSec = Math.max(0, Math.floor((data.deadlineAt - data.serverNow) / 1000));
      setTimeLeft(remainingSec);
      deadlineRef.current = data.deadlineAt;
      setExamStarted(true);
      setExamSubmitted(false);
      resetViolations();
      setCurrentQuestionIdx(0);
      setSelectedAnswers({});

      // Lock the screen into fullscreen right after the Start click's user gesture.
      enterFullscreen();
    } catch (err) {
      console.error("Failed to start exam:", err);
      setPinError(err instanceof Error ? err.message : "Something went wrong while loading the exam. Please try again.");
    } finally {
      setStartingExam(false);
    }
  };

  const handleSelectOption = (optionIdx: number) => {
    setSelectedAnswers((prev) => ({
      ...prev,
      [currentQuestionIdx]: optionIdx,
    }));
  };

  const triggerFinalSubmit = async (answers: { [key: number]: number }) => {
    // Lock the UI immediately so a slow network response can't let the student
    // keep answering (or double-submit) while grading is in flight.
    setExamSubmitted(true);
    setSubmitError("");
    exitFullscreen();

    try {
      // The server grades from its own session record: it knows the question
      // order, the deadline and the strike count. None of those come from here.
      const authHeaders = await getAuthHeaders();
      const res = await fetch("/api/grade-exam", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders },
        body: JSON.stringify({
          roomCode: examPin.trim().toUpperCase(),
          answers: Object.keys(answers)
            .sort((a, b) => Number(a) - Number(b))
            .map((k) => answers[Number(k)]),
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Failed to submit exam");

      setScore(data.score);
    } catch (err) {
      console.error("Failed to grade exam:", err);
      // Surface this instead of showing a fake 0/N score for a request the server
      // never graded.
      setSubmitError(err instanceof Error ? err.message : "Failed to submit exam");
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  // Countdown mirrors the server's deadline (authoritative); at zero the exam is
  // force-submitted and the server's overtime audit has the final say.
  useEffect(() => {
    if (!examStarted || examSubmitted) return;

    const timer = setInterval(() => {
      if (deadlineRef.current) {
        const remaining = Math.max(0, Math.ceil((deadlineRef.current - Date.now()) / 1000));
        setTimeLeft(remaining);
        if (remaining <= 0) {
          clearInterval(timer);
          triggerFinalSubmit(selectedAnswersRef.current);
        }
        return;
      }
      // Fallback if no deadline was recorded (shouldn't happen).
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          triggerFinalSubmit(selectedAnswersRef.current);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [examStarted, examSubmitted]);

  const handleBackToDesk = () => {
    setExamStarted(false);
    setExamSubmitted(false);
    setActiveQuestions([]);
    setSelectedAnswers({});
    setCurrentQuestionIdx(0);
    setScore(0);
    setSubmitError("");
    resetViolations();
    setExamPin("");
    deadlineRef.current = null;
    exitFullscreen();
  };

  const escapeHtml = (value: string) =>
    String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");

  const handleDownloadPDF = () => {
    const percentage = activeQuestions.length > 0 ? Math.round((score / activeQuestions.length) * 100) : 0;
    const issueDate = new Date().toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });

    const safeName = escapeHtml(studentName);
    const safeEmail = escapeHtml(studentEmail);
    const safePin = escapeHtml(examPin);
    const safeTitle = escapeHtml(quizTitle);

    const printWindow = window.open("", "_blank");
    if (!printWindow) return;

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Official Scorecard - ${safeName}</title>
          <style>
            body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; padding: 40px; color: #0f172a; }
            .cert-container { border: 8px solid #1e293b; padding: 40px; max-width: 700px; margin: 0 auto; }
            .header { text-align: center; border-bottom: 2px solid #e2e8f0; padding-bottom: 20px; }
            .title { font-size: 24px; font-weight: 800; color: #1e3a8a; margin: 0; }
            .content { margin: 30px 0; }
            .row { display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px dashed #cbd5e1; }
            .score-box { text-align: center; background: #f8fafc; border: 2px solid #3b82f6; padding: 20px; border-radius: 8px; margin: 25px 0; }
            .score-number { font-size: 38px; font-weight: 900; color: #2563eb; }
          </style>
        </head>
        <body>
          <div class="cert-container">
            <div class="header">
              <h1 class="title">THE BIG CLASSES</h1>
              <p>OFFICIAL PROCTORED EXAMINATION SCORECARD</p>
            </div>
            <div class="content">
              <div class="row"><span>Candidate Name</span><b>${safeName}</b></div>
              <div class="row"><span>Candidate Email</span><b>${safeEmail}</b></div>
              <div class="row"><span>Session Room PIN</span><b>${safePin}</b></div>
              <div class="row"><span>Exam Title</span><b>${safeTitle}</b></div>
              <div class="row"><span>Evaluation Date</span><b>${issueDate}</b></div>
              <div class="row"><span>Proctor Status</span><b>${strikes >= 3 ? "Violated Strikes (Disqualified)" : "Verified Clear"}</b></div>
            </div>
            <div class="score-box">
              <div>ACQUIRED SCORE</div>
              <div class="score-number">${score} / ${activeQuestions.length}</div>
              <b>${percentage}% Accuracy</b>
            </div>
          </div>
          <script>window.onload = function() { window.print(); };</script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  return (
    <div className="max-w-3xl mx-auto space-y-8">
      {!examStarted && !examSubmitted && (
        <div className="pt-10">
          <Card className="p-8 border-line bg-surface/90 shadow-2xl rounded-2xl">
            <div className="text-center mb-8 space-y-2">
              <div className="w-14 h-14 rounded-2xl bg-brand-600/20 border border-brand-500/30 flex items-center justify-center text-brand-ink mx-auto mb-3">
                <ShieldCheck className="w-7 h-7" />
              </div>
              <h1 className="text-2xl font-bold text-ink tracking-tight">Student Exam Portal</h1>
              <p className="text-ink-muted text-sm">Enter your credentials and room PIN to begin your proctored session.</p>
            </div>

            <form onSubmit={handleStartExam} className="space-y-5">
              <div className="p-3.5 rounded-xl bg-surface-3/60 border border-line-strong flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-brand-600/20 border border-brand-500/30 flex items-center justify-center text-brand-ink shrink-0">
                  <User className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] font-bold text-ink-muted uppercase tracking-wider">Signed in as</p>
                  <p className="text-sm font-bold text-ink truncate">{studentName}</p>
                  <p className="text-xs text-ink-muted truncate flex items-center gap-1">
                    <Mail className="w-3 h-3" /> {studentEmail}
                  </p>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-ink uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                  <Hash className="w-3.5 h-3.5 text-brand-ink" />
                  6-Digit Exam Room PIN
                </label>
                <Input
                  required
                  maxLength={6}
                  value={examPin}
                  onChange={(e) => setExamPin(e.target.value.toUpperCase())}
                  placeholder="e.g. 849201"
                  className="bg-surface-2 border-line-strong text-ink font-mono text-center tracking-widest text-lg font-bold placeholder:tracking-normal placeholder:text-sm placeholder:font-normal h-11"
                />
              </div>

              {pinError && (
                <p className="text-xs text-danger-ink font-semibold bg-danger-soft border border-danger-line p-2.5 rounded-lg">
                  {pinError}
                </p>
              )}

              <div className="p-3.5 rounded-xl bg-brand-950/30 border border-brand-800/40 text-xs text-ink-soft space-y-1">
                <p className="font-semibold text-brand-ink flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 text-brand-ink" />
                  Anti-Cheating Regulations:
                </p>
                <p>• Navigating out of the active window triggers an automatic strike.</p>
                <p>• 3 strikes immediately submits your test session.</p>
              </div>

              <Button
                type="submit"
                disabled={submitting || startingExam}
                className="w-full bg-brand-600 hover:bg-brand-500 text-on-brand font-bold py-3 text-sm rounded-xl shadow-lg shadow-brand-600/30 transition-all disabled:opacity-60 flex items-center justify-center gap-2"
              >
                {startingExam ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" /> Loading secure session...
                  </>
                ) : (
                  "Authenticate & Load Faculty Exam"
                )}
              </Button>
            </form>
          </Card>
        </div>
      )}

      {examStarted && !examSubmitted && (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-4 rounded-2xl bg-surface border border-line">
            <div className="flex items-center gap-3">
              <div className="w-3 h-3 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-xs font-bold uppercase tracking-wider text-ink-soft">
                {quizTitle} • Room #{examPin}
              </span>
            </div>

            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-surface-2 border border-line-strong text-warn-ink font-mono text-sm font-bold">
                <Clock className="w-4 h-4" />
                <span>{formatTime(timeLeft)}</span>
              </div>

              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-danger-soft border border-danger-line text-danger-ink text-xs font-bold">
                <AlertTriangle className="w-4 h-4 text-danger-ink" />
                <span>Strikes: {strikes} / 3</span>
              </div>
            </div>
          </div>

          <Card className="p-8 border-line bg-surface/90 shadow-2xl rounded-2xl">
            <div className="flex justify-between items-center mb-4 text-xs font-bold text-ink-muted border-b border-line pb-3">
              <span>Question {currentQuestionIdx + 1} of {activeQuestions.length}</span>
              <span className="text-brand-ink font-semibold">{studentName} ({studentEmail})</span>
            </div>

            <h2 className="text-lg font-bold text-ink mb-6 leading-relaxed">
              {activeQuestions[currentQuestionIdx]?.question}
            </h2>

            <div className="space-y-3 mb-8">
              {activeQuestions[currentQuestionIdx]?.options?.map((option, idx) => {
                const isSelected = selectedAnswers[currentQuestionIdx] === idx;
                return (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => handleSelectOption(idx)}
                    className={`w-full text-left p-4 rounded-xl border text-sm font-semibold transition-all flex items-center justify-between ${
                      isSelected
                        ? "bg-brand-600/20 border-brand-500 text-ink shadow-md shadow-brand-500/10"
                        : "bg-surface-3 border-line-strong text-ink hover:bg-surface-4 hover:text-ink"
                    }`}
                  >
                    <span className="text-ink">{option}</span>
                    <div
                      className={`w-5 h-5 rounded-full border flex items-center justify-center ${
                        isSelected ? "border-brand-400 bg-brand-600 text-on-brand" : "border-line-strong"
                      }`}
                    >
                      {isSelected && <div className="w-2 h-2 rounded-full bg-ink" />}
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="flex items-center justify-between border-t border-line pt-4">
              <Button
                disabled={currentQuestionIdx === 0}
                onClick={() => setCurrentQuestionIdx((p) => p - 1)}
                variant="outline"
                className="bg-surface-3 border-line-strong text-ink-soft hover:bg-surface-4 hover:text-ink text-xs"
              >
                Previous
              </Button>

              {currentQuestionIdx < activeQuestions.length - 1 ? (
                <Button
                  onClick={() => setCurrentQuestionIdx((p) => p + 1)}
                  className="bg-brand-600 hover:bg-brand-500 text-on-brand text-xs font-bold px-6"
                >
                  Next Question
                </Button>
              ) : (
                <Button
                  onClick={() => triggerFinalSubmit(selectedAnswers)}
                  className="bg-emerald-600 hover:bg-emerald-500 text-on-brand text-xs font-bold px-6 shadow-lg shadow-emerald-600/20"
                >
                  Submit Final Assessment
                </Button>
              )}
            </div>
          </Card>
        </div>
      )}

      {examSubmitted && (
        <div className="space-y-6">
          <Card className="p-8 border-line bg-surface/90 shadow-2xl rounded-2xl text-center space-y-6 max-w-xl mx-auto">
            <div className="w-16 h-16 rounded-2xl bg-success-soft border border-success-line flex items-center justify-center text-success-ink mx-auto">
              <Award className="w-8 h-8" />
            </div>

            <div className="space-y-2">
              <h2 className="text-2xl font-bold text-ink tracking-wide">
                Assessment Submitted
              </h2>
              <p className="text-ink-muted text-xs">
                Candidate: <b className="text-ink">{studentName}</b> ({studentEmail}) • Room: <b className="text-ink">#{examPin}</b>
              </p>
            </div>

            {submitError ? (
              <div className="p-5 rounded-2xl bg-danger-soft border border-danger-line space-y-2 max-w-md mx-auto text-left">
                <p className="text-xs uppercase font-bold tracking-wider text-danger-ink flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5" /> Not graded
                </p>
                <p className="text-xs text-danger-ink font-semibold">{submitError}</p>
                <p className="text-[11px] text-ink-muted">
                  Your answers were not scored. Tell your faculty member — they can check the room roster
                  and clear your attempt so you can retake it.
                </p>
              </div>
            ) : (
              <div className="p-6 rounded-2xl bg-surface-2 border border-line space-y-2 max-w-xs mx-auto">
                <p className="text-xs uppercase font-bold tracking-wider text-ink-muted">Final Score</p>
                <p className="text-4xl font-black text-brand-ink font-mono">
                  {score} / {activeQuestions.length}
                </p>
                <p className="text-xs font-semibold text-success-ink">
                  {activeQuestions.length > 0 ? Math.round((score / activeQuestions.length) * 100) : 0}% Accuracy
                </p>
              </div>
            )}

            <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-3">
              {!submitError && (
                <Button
                  onClick={handleDownloadPDF}
                  className="w-full sm:w-auto bg-brand-600 hover:bg-brand-500 text-on-brand font-bold py-3 px-8 rounded-xl shadow-lg shadow-brand-600/30 flex items-center justify-center gap-2"
                >
                  <Download className="w-4 h-4" />
                  <span>Download Official Scorecard (PDF)</span>
                </Button>
              )}

              <Button
                onClick={handleBackToDesk}
                variant="outline"
                className="w-full sm:w-auto bg-surface-3 border-line-strong text-ink hover:bg-surface-4 hover:text-ink font-bold py-3 px-8 rounded-xl flex items-center justify-center gap-2"
              >
                <ArrowLeft className="w-4 h-4" />
                <span className="text-ink">Back to Exam Desk</span>
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}