import { Link, useLocation } from "wouter";
import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { 
  BookOpen, 
  CheckSquare, 
  FileText, 
  GraduationCap, 
  History as HistoryIcon,
  Sparkles,
  ArrowRight
} from "lucide-react";

export function Dashboard() {
  const [, setLocation] = useLocation();

  // History moved to the very end
  const primaryCards = [
    {
      title: "Proctored Quiz & Exam Host",
      desc: "Draft timed examinations, host 6-digit PIN rooms, and monitor candidates in real-time with anti-cheating policy.",
      href: "/quiz",
      icon: CheckSquare,
      color: "text-brand-600 bg-brand-50 border-brand-200",
      cta: "Launch Arena"
    },
    {
      title: "AI Lesson Planner",
      desc: "Generate structured lectures, curriculums, and teaching material aligned to your syllabus.",
      href: "/lesson-plan",
      icon: BookOpen,
      color: "text-emerald-600 bg-emerald-50 border-emerald-200",
      cta: "Create Plan"
    },
    {
      title: "Assignment Creator",
      desc: "Produce homework, problem sets, and assessment rubrics for students in seconds.",
      href: "/assignment",
      icon: FileText,
      color: "text-purple-600 bg-purple-50 border-purple-200",
      cta: "Draft Homework"
    },
    {
      title: "AI Answer Sheet Grader",
      desc: "Grade handwritten or typed student answer sheets with intelligent visual evaluation.",
      href: "/grade",
      icon: GraduationCap,
      color: "text-amber-600 bg-amber-50 border-amber-200",
      cta: "Grade Answers"
    },
    {
      title: "Conducted Examination History",
      desc: "Access historical exam archives, view past questions, and review submitted candidate performance ledgers.",
      href: "/history",
      icon: HistoryIcon,
      color: "text-indigo-600 bg-indigo-50 border-indigo-200",
      cta: "View Archives"
    }
  ];

  return (
    <div className="space-y-8">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-5">
        <div>
          <h1 className="text-3xl font-serif font-bold text-white tracking-tight">
            Faculty Command Center
          </h1>
          <p className="text-slate-400 mt-1 text-sm">
            Unified AI-powered teaching, examination, and evaluation cockpit.
          </p>
        </div>
        <Button onClick={() => setLocation("/quiz")} className="bg-brand-600 hover:bg-brand-700 text-white font-semibold shadow">
          <Sparkles className="w-4 h-4 mr-2" /> Host New Quiz
        </Button>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {primaryCards.map((card) => (
          <Link key={card.title} href={card.href}>
            <Card className="p-6 border-slate-200 bg-white hover:border-brand-400 hover:shadow-lg transition-all cursor-pointer flex flex-col justify-between h-full group">
              <div className="space-y-3">
                <div className={`w-12 h-12 rounded-2xl border flex items-center justify-center font-bold ${card.color}`}>
                  <card.icon className="w-6 h-6" />
                </div>
                <h2 className="font-bold text-lg text-slate-900 group-hover:text-brand-600 transition-colors">
                  {card.title}
                </h2>
                <p className="text-xs text-slate-500 leading-relaxed">
                  {card.desc}
                </p>
              </div>

              <div className="pt-6 border-t border-slate-100 flex items-center justify-between text-xs font-semibold text-brand-600">
                <span>{card.cta}</span>
                <ArrowRight className="w-4 h-4 transform group-hover:translate-x-1 transition-transform" />
              </div>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
