import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Markdown } from "../components/markdown";
import { 
  getExamRoomsForTeacher, 
  getAllCandidates, 
  exportCandidatesToCSV,
  ExamRoom,
  ExamCandidate
} from "../lib/room-store";
import { useAuth } from "../lib/auth-context";
import {
  useGetClassroomHistory,
  useDeleteClassroomHistoryItem,
  ClassroomHistoryItem,
  QuizResult,
  GradeResult,
} from "../lib/api-client";
import { 
  History as HistoryIcon, 
  Users, 
  Clock, 
  Calendar, 
  Download, 
  ChevronRight, 
  CheckCircle2, 
  AlertOctagon,
  Activity,
  Play,
  ArrowLeft,
  BookOpen,
  FileText,
  GraduationCap,
  CheckSquare,
  Trash2,
  ChevronDown,
} from "lucide-react";

const TYPE_META: Record<string, { label: string; icon: any; color: string }> = {
  quiz: { label: "Quiz", icon: CheckSquare, color: "text-brand-600 bg-brand-50 border-brand-200" },
  "lesson-plan": { label: "Lesson Plan", icon: BookOpen, color: "text-emerald-600 bg-emerald-50 border-emerald-200" },
  assignment: { label: "Assignment", icon: FileText, color: "text-purple-600 bg-purple-50 border-purple-200" },
  grade: { label: "Grade", icon: GraduationCap, color: "text-amber-600 bg-amber-50 border-amber-200" },
};

function GeneratedHistoryCard({ item, onDelete }: { item: ClassroomHistoryItem; onDelete: (id: string) => void }) {
  const [expanded, setExpanded] = useState(false);
  const meta = TYPE_META[item.type] || { label: item.type, icon: HistoryIcon, color: "text-slate-600 bg-slate-50 border-slate-200" };
  const Icon = meta.icon;

  return (
    <Card className="border-slate-200 bg-white overflow-hidden">
      <div
        className="p-4 flex items-center justify-between cursor-pointer hover:bg-slate-50 transition-colors"
        onClick={() => setExpanded((v) => !v)}
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className={`w-9 h-9 rounded-lg border flex items-center justify-center shrink-0 ${meta.color}`}>
            <Icon className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className={`text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ${meta.color}`}>
                {meta.label}
              </span>
              <span className="text-[10px] text-slate-400 flex items-center gap-1">
                <Calendar className="w-3 h-3" /> {new Date(item.createdAt).toLocaleString()}
              </span>
            </div>
            <p className="text-sm font-bold text-slate-900 truncate mt-0.5">
              {item.title || item.topic || "Untitled"}
            </p>
            {item.subject && <p className="text-xs text-slate-500 truncate">{item.subject}</p>}
          </div>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <Button
            variant="ghost"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              onDelete(item.id);
            }}
            className="h-8 w-8 p-0 text-slate-400 hover:text-red-600 hover:bg-red-50"
          >
            <Trash2 className="w-4 h-4" />
          </Button>
          <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${expanded ? "rotate-180" : ""}`} />
        </div>
      </div>

      {expanded && (
        <div className="px-4 pb-4 pt-1 border-t border-slate-100">
          {item.type === "lesson-plan" || item.type === "assignment" ? (
            <div className="max-h-96 overflow-y-auto pr-1">
              <Markdown content={String(item.content || "")} />
            </div>
          ) : item.type === "quiz" ? (
            <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
              {(item.content as QuizResult)?.questions?.map((q, i) => (
                <div key={q.id || i} className="p-3 rounded-lg border border-slate-200 bg-slate-50/50 text-xs space-y-1">
                  <p className="font-semibold text-slate-900">Q{i + 1}. {q.question}</p>
                  <p className="text-emerald-700 font-medium">
                    Correct Answer: {q.correctAnswer || <span className="text-slate-400">Not available (hosted by a different teacher account)</span>}
                  </p>
                </div>
              ))}
            </div>
          ) : item.type === "grade" ? (
            <div className="space-y-3 text-sm">
              <p className="font-bold text-slate-900">
                Score: {(item.content as GradeResult)?.marksAwarded} / {(item.content as GradeResult)?.maxMarks} ({(item.content as GradeResult)?.grade})
              </p>
              <p className="text-slate-600">{(item.content as GradeResult)?.feedback}</p>
            </div>
          ) : (
            <pre className="text-xs text-slate-600 whitespace-pre-wrap">{JSON.stringify(item.content, null, 2)}</pre>
          )}
        </div>
      )}
    </Card>
  );
}

type TabKey = "exams" | "generated";

export function HistoryPage() {
  const [, setLocation] = useLocation();
  const [activeTab, setActiveTab] = useState<TabKey>("exams");
  const [examRooms, setExamRooms] = useState<ExamRoom[]>([]);
  const [selectedRoom, setSelectedRoom] = useState<ExamRoom | null>(null);
  const [allCandidates, setAllCandidates] = useState<ExamCandidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState<string>("all");

  const { user } = useAuth();
  const { data: generatedHistory = [], isLoading: generatedLoading } = useGetClassroomHistory(user?.id);
  const deleteHistoryItem = useDeleteClassroomHistoryItem(user?.id);

  const filteredGeneratedHistory =
    typeFilter === "all" ? generatedHistory : generatedHistory.filter((item) => item.type === typeFilter);

  useEffect(() => {
    if (!user?.id) {
      setLoading(false);
      return;
    }
    (async () => {
      try {
        const rooms = await getExamRoomsForTeacher(user.id);
        const candidateLists = await Promise.all(rooms.map((r) => getAllCandidates(r.roomCode)));
        setExamRooms(rooms);
        setAllCandidates(candidateLists.flat());
        if (rooms.length > 0) {
          setSelectedRoom(rooms[0]);
        }
      } catch (err) {
        console.error("Failed to load history:", err);
      } finally {
        setLoading(false);
      }
    })();
  }, [user?.id]);

  const candidatesForRoom = selectedRoom
    ? allCandidates.filter((c) => c.roomCode.trim().toUpperCase() === selectedRoom.roomCode.trim().toUpperCase())
    : [];

  const handleOpenInLive = (room: ExamRoom) => {
    localStorage.setItem(
      "ai_classroom_active_teacher_quiz",
      JSON.stringify({
        result: { topic: room.topic, questions: room.questions },
        hostedRoomCode: room.roomCode,
      })
    );
    setLocation("/quiz");
  };

  return (
    <div className="space-y-8">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={() => setLocation("/quiz")} 
              className="h-7 px-2 text-xs text-slate-500 hover:text-slate-800"
            >
              <ArrowLeft className="w-3.5 h-3.5 mr-1" /> Back to Quiz
            </Button>
          </div>
          <h1 className="text-3xl font-serif font-bold text-slate-900">History</h1>
          <p className="text-slate-600 mt-1">Audit past exams, and everything else AI has generated for you.</p>
        </div>

        {activeTab === "exams" && (
          <Button
            variant="outline"
            onClick={() => exportCandidatesToCSV()}
            className="border-slate-300 text-slate-700 hover:bg-slate-100 flex items-center gap-1.5 shadow-sm"
          >
            <Download className="w-4 h-4 text-brand-600" />
            Export All History (CSV)
          </Button>
        )}
      </header>

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200 -mt-4">
        <button
          onClick={() => setActiveTab("exams")}
          className={`px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors ${
            activeTab === "exams"
              ? "border-brand-600 text-brand-700"
              : "border-transparent text-slate-500 hover:text-slate-800"
          }`}
        >
          Conducted Exams ({examRooms.length})
        </button>
        <button
          onClick={() => setActiveTab("generated")}
          className={`px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors ${
            activeTab === "generated"
              ? "border-brand-600 text-brand-700"
              : "border-transparent text-slate-500 hover:text-slate-800"
          }`}
        >
          Generated Content ({generatedHistory.length})
        </button>
      </div>

      {activeTab === "generated" ? (
        <div className="space-y-5">
          {/* Type filter chips */}
          <div className="flex flex-wrap items-center gap-2">
            {["all", "quiz", "lesson-plan", "assignment", "grade"].map((key) => (
              <button
                key={key}
                onClick={() => setTypeFilter(key)}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
                  typeFilter === key
                    ? "bg-brand-600 border-brand-600 text-white"
                    : "bg-white border-slate-200 text-slate-600 hover:border-slate-300"
                }`}
              >
                {key === "all" ? "All" : TYPE_META[key]?.label || key}
              </button>
            ))}
          </div>

          {generatedLoading ? (
            <Card className="p-16 text-center border-slate-200 bg-white">
              <p className="text-sm text-slate-500">Loading generated content...</p>
            </Card>
          ) : filteredGeneratedHistory.length === 0 ? (
            <Card className="p-16 text-center border-slate-200 bg-white space-y-3">
              <HistoryIcon className="w-12 h-12 text-slate-300 mx-auto" />
              <h2 className="text-lg font-bold text-slate-800">Kuch bhi generate nahi hua abhi tak</h2>
              <p className="text-xs text-slate-500 max-w-sm mx-auto">
                Quiz, Lesson Plan, Assignment ya Grade generate karo — wo sab yahan dikhega.
              </p>
            </Card>
          ) : (
            <div className="space-y-3">
              {filteredGeneratedHistory.map((item) => (
                <GeneratedHistoryCard
                  key={item.id}
                  item={item}
                  onDelete={(id) => deleteHistoryItem.mutate(id)}
                />
              ))}
            </div>
          )}
        </div>
      ) : loading ? (
        <Card className="p-16 text-center border-slate-200 bg-white space-y-3">
          <p className="text-sm text-slate-500">Loading exam history...</p>
        </Card>
      ) : examRooms.length === 0 ? (
        <Card className="p-16 text-center border-slate-200 bg-white space-y-3">
          <HistoryIcon className="w-12 h-12 text-slate-300 mx-auto" />
          <h2 className="text-lg font-bold text-slate-800">No Exams Recorded in Archive</h2>
          <p className="text-xs text-slate-500 max-w-sm mx-auto">
            Jab aap Quiz Arena se exam host karenge aur students PIN enter karke test denge, tab saara data yahan aayega.
          </p>
          <Button onClick={() => setLocation("/quiz")} className="bg-brand-600 text-white text-xs mt-2">
            Go to Quiz Arena
          </Button>
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
          {/* Left: Exam list cards */}
          <div className="space-y-3 lg:col-span-1">
            <div className="flex items-center justify-between px-1">
              <h2 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                Exam Sessions ({examRooms.length})
              </h2>
              <span className="text-[10px] text-slate-400">Click to inspect</span>
            </div>

            {examRooms.map((room) => {
              const isSelected = selectedRoom?.roomCode === room.roomCode;
              const roomCandidates = allCandidates.filter(
                (c) => c.roomCode.trim().toUpperCase() === room.roomCode.trim().toUpperCase()
              );

              return (
                <div
                  key={room.roomCode}
                  onClick={() => setSelectedRoom(room)}
                  className={`p-4 rounded-xl border transition-all cursor-pointer ${
                    isSelected
                      ? "bg-brand-50/80 border-brand-500 shadow-sm ring-1 ring-brand-500"
                      : "bg-white border-slate-200 hover:border-slate-300"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs font-bold text-brand-700 bg-white px-2 py-0.5 rounded border border-brand-200">
                      PIN: {room.roomCode}
                    </span>
                    <span className="text-[10px] text-slate-400 flex items-center gap-1">
                      <Calendar className="w-3 h-3" /> {new Date(room.createdAt).toLocaleDateString()}
                    </span>
                  </div>

                  <h3 className="font-bold text-sm text-slate-900 mt-2 truncate">{room.topic}</h3>
                  <p className="text-xs text-slate-500 truncate">{room.subject}</p>

                  <div className="flex items-center justify-between text-[11px] text-slate-500 mt-3 pt-2 border-t border-slate-100">
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3" /> {room.durationMinutes || 10} Mins
                    </span>
                    <span className="font-semibold text-slate-700 flex items-center gap-0.5">
                      <Users className="w-3 h-3 text-brand-600" /> {roomCandidates.length} Students
                      <ChevronRight className="w-3 h-3 ml-1" />
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Right: Selected Exam Details & Students Table */}
          {selectedRoom && (
            <div className="lg:col-span-2 space-y-6">
              <Card className="p-6 border-slate-200 bg-white shadow-sm space-y-5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-200 pb-4 gap-3">
                  <div>
                    <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded ${
                      selectedRoom.status === "closed" ? "bg-slate-100 text-slate-600" : "bg-emerald-100 text-emerald-800"
                    }`}>
                      {selectedRoom.status === "closed" ? "Closed Archive" : "Active Room"}
                    </span>
                    <h2 className="text-2xl font-serif font-bold text-slate-900 mt-1">{selectedRoom.topic}</h2>
                    <p className="text-xs text-slate-500">Subject: {selectedRoom.subject} | Room Code: <span className="font-mono font-bold text-slate-800">{selectedRoom.roomCode}</span></p>
                  </div>

                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => exportCandidatesToCSV(selectedRoom.roomCode)}
                      className="text-xs border-slate-300"
                    >
                      <Download className="w-3.5 h-3.5 mr-1 text-brand-600" /> Export CSV
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => handleOpenInLive(selectedRoom)}
                      className="bg-brand-600 hover:bg-brand-700 text-white text-xs font-semibold"
                    >
                      <Play className="w-3.5 h-3.5 mr-1" /> Reopen in Quiz Arena
                    </Button>
                  </div>
                </div>

                {/* Candidates Table */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                      <Users className="w-4 h-4 text-brand-600" /> Candidate Evaluation Sheet ({candidatesForRoom.length})
                    </h3>
                  </div>

                  {candidatesForRoom.length === 0 ? (
                    <div className="p-8 text-center border border-dashed border-slate-200 rounded-xl text-slate-400 text-xs">
                      No candidate submissions recorded for PIN {selectedRoom.roomCode}.
                    </div>
                  ) : (
                    <div className="overflow-x-auto border border-slate-200 rounded-xl">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-slate-50 text-slate-700 font-semibold border-b border-slate-200">
                          <tr>
                            <th className="p-3">Student Name</th>
                            <th className="p-3">Proctor Status</th>
                            <th className="p-3">Policy Strikes</th>
                            <th className="p-3">Marks Obtained</th>
                            <th className="p-3">Time</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 font-medium text-slate-800">
                          {candidatesForRoom.map((cand, idx) => (
                            <tr key={idx} className="hover:bg-slate-50 transition-colors">
                              <td className="p-3">
                                <p className="font-bold text-slate-900">{cand.studentName}</p>
                                <p className="text-[11px] text-slate-400">{cand.studentEmail || "No Email"}</p>
                              </td>
                              <td className="p-3">
                                {cand.status === "in-progress" && (
                                  <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 text-[10px] font-semibold flex items-center gap-1 w-fit">
                                    <Activity className="w-2.5 h-2.5" /> In Progress
                                  </span>
                                )}
                                {cand.status === "completed" && (
                                  <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-semibold flex items-center gap-1 w-fit">
                                    <CheckCircle2 className="w-2.5 h-2.5" /> Submitted
                                  </span>
                                )}
                                {cand.status === "disqualified" && (
                                  <span className="px-2 py-0.5 rounded-full bg-red-100 text-red-700 text-[10px] font-semibold flex items-center gap-1 w-fit">
                                    <AlertOctagon className="w-2.5 h-2.5" /> Disqualified (3 Strikes)
                                  </span>
                                )}
                              </td>
                              <td className="p-3 font-mono">
                                <span className={cand.violations >= 3 ? "text-red-600 font-bold" : "text-slate-600"}>
                                  {cand.violations || 0} / 3
                                </span>
                              </td>
                              <td className="p-3 font-mono font-bold">
                                {cand.status === "disqualified" ? (
                                  <span className="text-red-600">0 (Expelled)</span>
                                ) : (
                                  <span className="text-brand-700">
                                    {cand.score} / {cand.total} ({cand.percentage}%)
                                  </span>
                                )}
                              </td>
                              <td className="p-3 text-[11px] text-slate-400">
                                {new Date(cand.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                {/* Questions in Paper */}
                <div className="space-y-3 pt-3 border-t border-slate-100">
                  <h3 className="text-sm font-bold text-slate-900">Questions in Paper ({selectedRoom.questions?.length || 0})</h3>
                  <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                    {selectedRoom.questions?.map((q, i) => (
                      <div key={q.id || i} className="p-3 rounded-lg border border-slate-200 bg-slate-50/50 text-xs space-y-1">
                        <p className="font-semibold text-slate-900">Q{i + 1}. {q.question}</p>
                        <p className="text-emerald-700 font-medium">Correct Answer: {q.correctAnswer}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </Card>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Dono exports supported hain (HistoryPage aur History) taaki import kabhi fail na ho
export { HistoryPage as History };