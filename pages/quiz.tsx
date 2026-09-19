import { useState, useRef, useEffect } from "react";
import { useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../lib/auth-context";
import { 
  useGenerateQuiz, 
  getGetClassroomHistoryQueryKey, 
  type QuizResult 
} from "../lib/api-client";
import { 
  saveExamRoom, 
  closeExamRoom, 
  findExamRoom, 
  getAllCandidates, 
  exportCandidatesToCSV,
  ExamCandidate 
} from "../lib/room-store";
import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "../components/ui/form";
import { Input } from "../components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { 
  CheckSquare, 
  Loader2, 
  FileUp, 
  X, 
  FileText, 
  Radio, 
  Copy, 
  Check, 
  Users, 
  Clock, 
  History as HistoryIcon,
  RotateCcw,
  Mail,
  Activity,
  AlertOctagon,
  Lock,
  Download,
  Trophy,
  CheckCircle2
} from "lucide-react";
import * as pdfjsLib from "pdfjs-dist";

pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

const formSchema = z.object({
  topic: z.string().optional(),
  subject: z.string().optional(),
  numberOfQuestions: z.coerce.number().min(1),
  difficulty: z.enum(["easy", "medium", "hard"]),
  durationMinutes: z.coerce.number().min(1).max(60),
  sourceContext: z.string().optional(),
});

const ACTIVE_QUIZ_STORAGE_KEY = "ai_classroom_active_teacher_quiz";

export function Quiz() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();

  const [result, setResult] = useState<QuizResult | null>(() => {
    const saved = localStorage.getItem(ACTIVE_QUIZ_STORAGE_KEY);
    if (!saved) return null;
    try {
      const parsed = JSON.parse(saved);
      return parsed.result || null;
    } catch {
      return null;
    }
  });

  const [hostedRoomCode, setHostedRoomCode] = useState<string | null>(() => {
    const saved = localStorage.getItem(ACTIVE_QUIZ_STORAGE_KEY);
    if (!saved) return null;
    try {
      const parsed = JSON.parse(saved);
      return parsed.hostedRoomCode || null;
    } catch {
      return null;
    }
  });

  const [isRoomClosed, setIsRoomClosed] = useState<boolean>(false);
  const [copied, setCopied] = useState<boolean>(false);
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);
  const [isReadingPdf, setIsReadingPdf] = useState<boolean>(false);
  const [candidates, setCandidates] = useState<ExamCandidate[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { user } = useAuth();
  const generateQuiz = useGenerateQuiz(user?.id);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      topic: "",
      subject: "",
      numberOfQuestions: 5,
      difficulty: "medium",
      durationMinutes: 10,
      sourceContext: "",
    },
  });

  // State sync to localStorage
  useEffect(() => {
    if (result || hostedRoomCode) {
      localStorage.setItem(
        ACTIVE_QUIZ_STORAGE_KEY,
        JSON.stringify({ result, hostedRoomCode })
      );
    }
  }, [result, hostedRoomCode]);

  // Load and refresh candidates
  const loadCandidates = async (pin: string) => {
    try {
      const data = await getAllCandidates(user?.id || "", pin);
      setCandidates(data);
      const room = await findExamRoom(pin);
      if (room) {
        setIsRoomClosed(room.status === "closed");
      }
    } catch (err) {
      console.error("Failed to load candidates:", err);
    }
  };

  useEffect(() => {
    if (hostedRoomCode) {
      loadCandidates(hostedRoomCode);
      const interval = setInterval(() => loadCandidates(hostedRoomCode), 2000);
      return () => clearInterval(interval);
    }
  }, [hostedRoomCode]);

  const extractTextFromPdf = async (file: File): Promise<string> => {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    let fullText = "";

    const maxPages = Math.min(pdf.numPages, 10);
    for (let i = 1; i <= maxPages; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      const pageText = textContent.items.map((item: any) => item.str).join(" ");
      fullText += pageText + "\n";
    }
    return fullText;
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadedFileName(file.name);
    setIsReadingPdf(true);

    try {
      let extractedText = "";
      if (file.type === "application/pdf" || file.name.endsWith(".pdf")) {
        extractedText = await extractTextFromPdf(file);
      } else {
        extractedText = await file.text();
      }

      form.setValue("sourceContext", extractedText.slice(0, 12000));
      const cleanName = file.name.replace(/\.[^/.]+$/, "").replace(/[-_]/g, " ");
      if (!form.getValues("topic")) form.setValue("topic", cleanName);
      if (!form.getValues("subject")) form.setValue("subject", "Uploaded Material");
    } catch (err) {
      console.error(err);
      alert("Failed to read PDF document.");
      setUploadedFileName(null);
    } finally {
      setIsReadingPdf(false);
    }
  };

  const onSubmit = (values: z.infer<typeof formSchema>) => {
    if (!values.sourceContext && !values.topic) {
      alert("Please provide a Topic or upload a PDF/Notes file.");
      return;
    }

    setResult(null);
    setHostedRoomCode(null);
    setCandidates([]);
    setIsRoomClosed(false);
    localStorage.removeItem(ACTIVE_QUIZ_STORAGE_KEY);

    generateQuiz.mutate({
      data: {
        ...values,
        topic: values.topic || "Document Review",
        subject: values.subject || "General Knowledge",
      }
    }, {
      onSuccess: (data) => {
        setResult(data);
        queryClient.invalidateQueries({ queryKey: getGetClassroomHistoryQueryKey(user?.id) });
      }
    });
  };

  const handleHostExam = async () => {
    if (!result) return;
    const pin = Math.floor(100000 + Math.random() * 900000).toString();

    try {
      await saveExamRoom({
    roomCode: pin,
    topic: result.topic,
    subject: form.getValues("subject") || "General",
    createdAt: new Date().toISOString(),
    durationMinutes: form.getValues("durationMinutes") || 10,
    status: "active",
    teacherId: user?.id,
    questions: result.questions,
   });

      setHostedRoomCode(pin);
      setIsRoomClosed(false);
      loadCandidates(pin);
    } catch (err) {
      console.error("Failed to host exam room:", err);
      alert("Failed to create exam room. Please try again.");
    }
  };

  const handleEndRoom = async () => {
    if (!hostedRoomCode) return;
    if (confirm(`Are you sure you want to end Room PIN: ${hostedRoomCode}? No further submissions will be accepted.`)) {
      try {
        await closeExamRoom(hostedRoomCode);
        setIsRoomClosed(true);
        loadCandidates(hostedRoomCode);
      } catch (err) {
        console.error("Failed to close room:", err);
        alert("Failed to end the room. Please try again.");
      }
    }
  };

  const copyCode = () => {
    if (!hostedRoomCode) return;
    navigator.clipboard.writeText(hostedRoomCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const clearCurrentSession = () => {
    if (confirm("Reset current quiz session and start fresh?")) {
      setResult(null);
      setHostedRoomCode(null);
      setCandidates([]);
      setIsRoomClosed(false);
      localStorage.removeItem(ACTIVE_QUIZ_STORAGE_KEY);
    }
  };

  const handleSendEmail = (cand: ExamCandidate) => {
    const recipient = cand.studentEmail || prompt(`Enter email address for ${cand.studentName}:`);
    if (!recipient || !recipient.trim()) return;

    const scoreLine = cand.status === "disqualified"
      ? `Result: DISQUALIFIED (Reason: 3 Policy Strikes / Tab-Switch Cheating Attempt)`
      : `Good Job! Marks: ${cand.score} out of ${cand.total} (Accuracy: ${cand.percentage}%)`;

    const subject = encodeURIComponent(`The Big Classes - Official Exam Scorecard (PIN: ${cand.roomCode})`);
    const body = encodeURIComponent(
      `Dear ${cand.studentName},\n\n` +
      `Here is your official examination evaluation:\n\n` +
      `Exam Topic: ${result?.topic || "Exam Session"}\n` +
      `Room PIN: ${cand.roomCode}\n` +
      `${scoreLine}\n` +
      `Status: ${cand.status.toUpperCase()}\n` +
      `Violations Detected: ${cand.violations} / 3\n` +
      (cand.overtime ? `Overtime: Yes (+${cand.overtimeMinutes || 0} min past deadline)\n` : "") +
      `Recorded Timestamp: ${new Date(cand.updatedAt).toLocaleString()}\n\n` +
      `Best Wishes,\n` +
      `Faculty Desk - The Big Classes Engine`
    );

    window.open(`mailto:${recipient}?subject=${subject}&body=${body}`, "_blank");
  };

  // Sorted candidates by score for the ranking table
  const rankedCandidates = [...candidates].sort((a, b) => (b.score || 0) - (a.score || 0));

  return (
    <div className="space-y-8">
      {/* Top Header */}
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-paper-line pb-5">
        <div>
          <h1 className="text-3xl font-serif font-bold text-paper-ink">Quiz & Proctoring Arena</h1>
          <p className="text-paper-ink-soft mt-1">Configure timed proctored exams, host live rooms, and monitor candidates in real-time.</p>
        </div>

        <div className="shrink-0 flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setLocation("/history")}
            className="border-paper-line-strong text-paper-ink-soft hover:bg-paper-3 flex items-center gap-1.5"
          >
            <HistoryIcon className="w-4 h-4 text-brand-600" />
            Conducted History
          </Button>

          {(result || hostedRoomCode) && (
            <Button
              variant="outline"
              size="sm"
              onClick={clearCurrentSession}
              className="border-red-200 text-red-600 hover:bg-red-50 flex items-center gap-1.5"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              New / Reset
            </Button>
          )}

          {hostedRoomCode ? (
            <div className="flex items-center gap-2">
              <div className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl border shadow-sm ${
                isRoomClosed 
                  ? "bg-paper-3 border-paper-line-strong text-paper-ink-soft" 
                  : "bg-emerald-50 border-emerald-300 text-emerald-900"
              }`}>
                <div className="text-left">
                  <span className={`text-[10px] font-bold uppercase tracking-wider block ${
                    isRoomClosed ? "text-paper-ink-muted" : "text-emerald-700"
                  }`}>
                    {isRoomClosed ? "Room Closed" : "Live Room PIN"}
                  </span>
                  <span className="text-xl font-mono font-extrabold tracking-widest leading-none">
                    {hostedRoomCode}
                  </span>
                </div>
                <Button size="sm" variant="ghost" onClick={copyCode} className="h-8 w-8 p-0 hover:bg-black/5">
                  {copied ? <Check className="w-4 h-4 text-emerald-700" /> : <Copy className="w-4 h-4" />}
                </Button>
              </div>

              {!isRoomClosed && (
                <Button
                  size="sm"
                  onClick={handleEndRoom}
                  className="bg-red-600 hover:bg-red-700 text-white text-xs h-9 px-3 font-semibold flex items-center gap-1.5 shadow"
                >
                  <Lock className="w-3.5 h-3.5" />
                  End Exam
                </Button>
              )}
            </div>
          ) : (
            <Button
              onClick={handleHostExam}
              disabled={!result}
              className={`font-semibold shadow-md transition-all flex items-center gap-2 ${
                result
                  ? "bg-brand-600 hover:bg-brand-700 text-white animate-pulse"
                  : "bg-paper-4 text-paper-ink-muted cursor-not-allowed border border-paper-line-strong"
              }`}
            >
              <Radio className="w-4 h-4" />
              {result ? "Host Exam (Get PIN)" : "Generate Quiz First"}
            </Button>
          )}
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
        {/* LEFT COLUMN: Form + LIVE PROCTORING MONITOR */}
        <div className="lg:col-span-1 space-y-6">
          <Card className="p-6 border-paper-line bg-paper shadow-sm space-y-4">
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <div className="p-3 border border-dashed border-brand-200 rounded-lg bg-brand-50/50 space-y-2">
                  <span className="text-xs font-semibold text-paper-ink-soft block">Upload Document (Optional)</span>
                  <input
                    type="file"
                    accept=".pdf,.txt,.md"
                    ref={fileInputRef}
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                  
                  {uploadedFileName ? (
                    <div className="flex items-center justify-between bg-paper p-2.5 rounded border text-xs shadow-sm">
                      <div className="flex items-center gap-2 truncate">
                        <FileText className="w-4 h-4 text-brand-600 shrink-0" />
                        <span className="truncate font-medium text-paper-ink">{uploadedFileName}</span>
                      </div>
                      <button 
                        type="button" 
                        onClick={() => { 
                          setUploadedFileName(null); 
                          form.setValue("sourceContext", ""); 
                          if (fileInputRef.current) fileInputRef.current.value = "";
                        }}
                      >
                        <X className="w-4 h-4 text-red-500 hover:text-red-700" />
                      </button>
                    </div>
                  ) : (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="w-full text-xs h-9 flex items-center gap-2 bg-paper"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={isReadingPdf}
                    >
                      {isReadingPdf ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          Reading PDF...
                        </>
                      ) : (
                        <>
                          <FileUp className="w-3.5 h-3.5 text-brand-600" />
                          Upload PDF Syllabus
                        </>
                      )}
                    </Button>
                  )}
                </div>

                <FormField
                  control={form.control}
                  name="topic"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Topic / Chapter</FormLabel>
                      <FormControl>
                        <Input placeholder={uploadedFileName ? "Auto-detected" : "e.g. Cache Memory"} {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="subject"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Subject</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g. Computer Architecture" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid grid-cols-2 gap-3">
                  <FormField
                    control={form.control}
                    name="numberOfQuestions"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Questions</FormLabel>
                        <FormControl>
                          <Input type="number" min={1} {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="durationMinutes"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="flex items-center gap-1">
                          <Clock className="w-3 h-3 text-brand-600" /> Time (Mins)
                        </FormLabel>
                        <FormControl>
                          <Input type="number" min={1} max={60} {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="difficulty"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Difficulty</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Difficulty" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="easy">Easy</SelectItem>
                          <SelectItem value="medium">Medium</SelectItem>
                          <SelectItem value="hard">Hard</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <Button type="submit" className="w-full bg-brand-600 hover:bg-brand-700 text-white shadow" disabled={generateQuiz.isPending || isReadingPdf}>
                  {generateQuiz.isPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Drafting Paper...
                    </>
                  ) : (
                    <>
                      <CheckSquare className="mr-2 h-4 w-4" />
                      Draft Timed Quiz
                    </>
                  )}
                </Button>
              </form>
            </Form>
          </Card>

          {/* LIVE PROCTORING MONITOR */}
          <Card className="p-5 border-paper-line bg-paper shadow-sm space-y-3">
            <div className="flex items-center justify-between border-b border-paper-line pb-2">
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-brand-600" />
                <span className="font-bold text-sm text-paper-ink">Active Test Candidates</span>
              </div>
              {hostedRoomCode && (
                <span className="text-[10px] font-mono bg-brand-50 text-brand-700 border border-brand-200 px-2 py-0.5 rounded font-bold">
                  PIN: {hostedRoomCode}
                </span>
              )}
            </div>

            {!hostedRoomCode ? (
              <div className="py-6 text-center text-paper-ink-muted text-xs">
                Host an exam to view candidates in real-time.
              </div>
            ) : candidates.length === 0 ? (
              <div className="py-6 text-center text-paper-ink-muted text-xs space-y-1">
                <p className="font-medium text-paper-ink-soft">No candidates have joined yet.</p>
                <p className="text-[11px]">Share PIN {hostedRoomCode} with students.</p>
              </div>
            ) : (
              <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                {candidates.map((cand, i) => (
                  <div key={i} className="p-2.5 rounded-lg border border-paper-line bg-paper-2 text-xs flex items-center justify-between">
                    <div className="space-y-0.5">
                      <p className="font-bold text-paper-ink">{cand.studentName}</p>
                      <p className="text-[10px] text-paper-ink-muted">{cand.studentEmail || "No Email"}</p>
                    </div>

                    <div>
                      {cand.status === "in-progress" && (
                        <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 font-semibold text-[10px] flex items-center gap-1">
                          <Activity className="w-2.5 h-2.5 animate-pulse" /> Taking Test
                        </span>
                      )}
                      {cand.status === "completed" && (
                        <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-semibold text-[10px] flex items-center gap-1">
                          <Check className="w-2.5 h-2.5" /> Completed ({cand.score}/{cand.total})
                        </span>
                      )}
                      {cand.status === "disqualified" && (
                        <span className="px-2 py-0.5 rounded-full bg-red-100 text-red-700 font-semibold text-[10px] flex items-center gap-1">
                          <AlertOctagon className="w-2.5 h-2.5" /> 3 Strikes Exit
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>

        {/* RIGHT COLUMN: RANKING LEADERBOARD + EMAIL DISPATCH & QUESTIONS */}
        <div className="lg:col-span-2 space-y-6">
          {generateQuiz.isPending && (
            <Card className="p-12 flex flex-col items-center justify-center text-paper-ink-muted border-paper-line bg-paper">
              <Loader2 className="h-8 w-8 animate-spin text-brand-600 mb-4" />
              <p>Formulating questions and setting duration bounds...</p>
            </Card>
          )}

          {/* RANKING & EMAIL SEND SECTION */}
          {hostedRoomCode && candidates.length > 0 && (
            <Card className="p-6 border-paper-line bg-paper shadow-sm space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-paper-line pb-3">
                <div className="flex items-center gap-2">
                  <Trophy className="w-5 h-5 text-amber-500" />
                  <div>
                    <h3 className="font-bold text-base text-paper-ink">Student Ranking & Result Dispatch</h3>
                    <p className="text-xs text-paper-ink-muted">Official scorecard generation with single-click email delivery.</p>
                  </div>
                </div>

                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => exportCandidatesToCSV(hostedRoomCode)}
                  className="text-xs h-8 flex items-center gap-1.5 border-paper-line-strong"
                >
                  <Download className="w-3.5 h-3.5 text-brand-600" />
                  Export CSV Ledger
                </Button>
              </div>

              <div className="overflow-x-auto border border-paper-line rounded-xl">
                <table className="w-full text-left text-xs">
                  <thead className="bg-paper-2 text-paper-ink-soft font-semibold border-b border-paper-line">
                    <tr>
                      <th className="p-3">Rank</th>
                      <th className="p-3">Candidate</th>
                      <th className="p-3">Status</th>
                      <th className="p-3">Evaluation</th>
                      <th className="p-3 text-right">Result Delivery</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-paper-line font-medium text-paper-ink">
                    {rankedCandidates.map((c, rankIdx) => (
                      <tr key={rankIdx} className="hover:bg-paper-2 transition-colors">
                        <td className="p-3 font-mono font-bold text-paper-ink-muted">
                          #{rankIdx + 1}
                        </td>
                        <td className="p-3">
                          <p className="font-bold text-paper-ink">{c.studentName}</p>
                          <p className="text-[11px] text-paper-ink-muted">{c.studentEmail || "No email"}</p>
                        </td>
                        <td className="p-3">
                          {c.status === "in-progress" && (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 bg-amber-50 text-amber-700 border border-amber-200 rounded-full font-semibold text-[11px]">
                              In Progress
                            </span>
                          )}
                          {c.status === "completed" && (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full font-semibold text-[11px]">
                              Submitted
                            </span>
                          )}
                          {c.status === "disqualified" && (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 bg-red-50 text-red-700 border border-red-200 rounded-full font-semibold text-[11px]">
                              Disqualified (3 Strikes)
                            </span>
                          )}
                        </td>
                        <td className="p-3">
                          {c.status === "in-progress" ? (
                            <span className="text-paper-ink-muted italic">Writing...</span>
                          ) : c.status === "disqualified" ? (
                            <span className="text-red-600 font-semibold">Expelled (Auto Submit)</span>
                          ) : (
                            <span className="font-bold text-brand-700 font-mono">
                              Good Job! {c.score} out of {c.total} ({c.percentage}%)
                            </span>
                          )}
                        </td>
                        <td className="p-3 text-right">
                          <Button
                            size="sm"
                            disabled={c.status === "in-progress"}
                            onClick={() => handleSendEmail(c)}
                            className="h-8 px-3 text-xs bg-brand-50 text-brand-700 hover:bg-brand-600 hover:text-white border border-brand-200 font-semibold inline-flex items-center gap-1.5 shadow-sm"
                          >
                            <Mail className="w-3.5 h-3.5" />
                            Send Result
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}

          {/* QUESTIONS PREVIEW */}
          {!generateQuiz.isPending && result && (
            <div className="space-y-6 animate-in fade-in duration-300">
              <div className="flex items-center justify-between border-b border-paper-line pb-2">
                <div>
                  <h2 className="text-2xl font-serif font-bold text-paper-ink">{result.topic}</h2>
                  <span className="text-xs text-paper-ink-muted">Session saved. Survives page refreshes.</span>
                </div>
                <span className="text-xs text-paper-ink-soft font-medium bg-paper-3 px-3 py-1 rounded-full border border-paper-line">
                  Total Questions: {result.questions.length}
                </span>
              </div>
              
              {result.questions.map((q, index) => (
                <Card key={q.id} className="p-6 border-paper-line bg-paper">
                  <div className="flex gap-4">
                    <div className="flex-shrink-0 w-8 h-8 rounded-full bg-paper-3 flex items-center justify-center font-bold text-paper-ink-soft">
                      {index + 1}
                    </div>
                    <div className="flex-1 space-y-3">
                      <p className="text-base font-semibold text-paper-ink">{q.question}</p>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                        {q.options.map((opt, i) => (
                          <div
                            key={i}
                            className={`p-2.5 rounded-lg border text-xs flex items-center ${
                              opt === q.correctAnswer
                                ? "bg-emerald-50 border-emerald-300 text-emerald-900 font-semibold"
                                : "bg-paper border-paper-line text-paper-ink"
                            }`}
                          >
                            <span className="font-semibold mr-2">{String.fromCharCode(65 + i)}.</span>
                            {opt}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}

          {!generateQuiz.isPending && !result && (
            <div className="h-full min-h-[380px] border-2 border-dashed border-paper-line rounded-xl flex flex-col items-center justify-center text-paper-ink-muted bg-paper-2/50">
              <CheckSquare className="h-10 w-10 text-paper-ink-muted mb-3" />
              <p className="text-sm font-medium text-paper-ink-soft">Draft a quiz or upload a document to begin.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}