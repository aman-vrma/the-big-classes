import { useState, useEffect } from "react";
import { getCandidateHistory, ExamCandidate } from "../lib/room-store";
import { useAuth } from "../lib/auth-context";
import { Card } from "../components/ui/card";
import { History, Award, AlertTriangle, CheckCircle2, XCircle, Clock3, Loader2 } from "lucide-react";

type HistoryRecord = ExamCandidate & { topic?: string; subject?: string };

export function StudentHistoryPage() {
  const { user } = useAuth();
  const [records, setRecords] = useState<HistoryRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user?.email) {
      setLoading(false);
      return;
    }

    (async () => {
      setLoading(true);
      try {
        const data = await getCandidateHistory(user.email);
        setRecords(data);
      } catch (err) {
        console.error("Failed to load history:", err);
        setRecords([]);
      } finally {
        setLoading(false);
      }
    })();
  }, [user?.email]);

  const statusBadge = (status: string) => {
    if (status === "completed") {
      return (
        <span className="inline-flex items-center gap-1 text-success-ink bg-success-soft border border-success-line px-2.5 py-1 rounded-lg text-xs font-bold">
          <CheckCircle2 className="w-3.5 h-3.5" /> Completed
        </span>
      );
    }
    if (status === "disqualified") {
      return (
        <span className="inline-flex items-center gap-1 text-danger-ink bg-danger-soft border border-danger-line px-2.5 py-1 rounded-lg text-xs font-bold">
          <XCircle className="w-3.5 h-3.5" /> Disqualified
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 text-warn-ink bg-warn-soft border border-warn-line px-2.5 py-1 rounded-lg text-xs font-bold">
        <Clock3 className="w-3.5 h-3.5" /> In Progress
      </span>
    );
  };

  return (
    <div className="space-y-8 max-w-4xl mx-auto">
      <header className="border-b border-line pb-5">
        <h1 className="text-3xl font-serif font-bold text-ink tracking-tight flex items-center gap-3">
          <History className="w-7 h-7 text-brand-ink" />
          My Exam History
        </h1>
        <p className="text-ink-muted mt-1 text-sm">
          Attempts made by <span className="text-brand-ink font-semibold">{user?.email}</span>
        </p>
      </header>

      {loading && (
        <Card className="p-12 border-line bg-surface/90 rounded-2xl text-center">
          <Loader2 className="w-6 h-6 text-brand-ink animate-spin mx-auto mb-2" />
          <p className="text-ink-muted text-sm">Loading your history...</p>
        </Card>
      )}

      {!loading && records.length === 0 && (
        <Card className="p-8 border-line bg-surface/90 rounded-2xl text-center space-y-2">
          <AlertTriangle className="w-8 h-8 text-warn-ink mx-auto" />
          <p className="text-ink-soft text-sm font-semibold">No exam attempts found yet.</p>
          <p className="text-ink-muted text-xs">
            Once you take an exam, it will show up here automatically.
          </p>
        </Card>
      )}

      {!loading && records.length > 0 && (
        <div className="space-y-4">
          {records.map((r, idx) => (
            <Card
              key={idx}
              className="p-5 border-line bg-surface/90 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-4"
            >
              <div className="space-y-1">
                <p className="text-ink font-bold text-sm">
                  {r.topic || "Untitled Exam"} <span className="text-ink-muted font-normal">• Room #{r.roomCode}</span>
                </p>
                <p className="text-ink-muted text-xs">
                  {r.subject ? `${r.subject} • ` : ""}
                  {new Date(r.updatedAt).toLocaleString()}
                </p>
                {statusBadge(r.status)}
              </div>

              <div className="flex items-center gap-4">
                <div className="text-center px-4 py-2 rounded-xl bg-surface-2 border border-line">
                  <p className="text-[10px] uppercase font-bold text-ink-muted">Score</p>
                  <p className="text-lg font-black text-brand-ink font-mono flex items-center gap-1 justify-center">
                    <Award className="w-4 h-4" />
                    {r.score ?? 0}/{r.total ?? 0}
                  </p>
                </div>
                <div className="text-center px-4 py-2 rounded-xl bg-surface-2 border border-line">
                  <p className="text-[10px] uppercase font-bold text-ink-muted">Accuracy</p>
                  <p className="text-lg font-black text-success-ink font-mono">{r.percentage ?? 0}%</p>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
