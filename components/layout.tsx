import { Link, useLocation } from "wouter";
import { 
  BookOpen, 
  CheckSquare, 
  FileText, 
  LayoutDashboard, 
  GraduationCap, 
  History, 
  ShieldCheck, 
  LogOut,
  Sparkles,
  UserCircle
} from "lucide-react";
import { useAuth } from "../lib/auth-context";

function initialsOf(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function Layout({ children }: { children: React.ReactNode }) {
  const [location, setLocation] = useLocation();
  const { user, logout } = useAuth();

  const isStudentPerspective = location.startsWith("/student") || user?.role === "student";

  // Restored Original Order: Dashboard -> Quiz -> Lesson Plan -> Assignment -> History -> Grader
  const teacherNav = [
    { label: "Faculty Dashboard", href: "/", icon: LayoutDashboard },
    { label: "Quiz Arena", href: "/quiz", icon: CheckSquare },
    { label: "Lesson Planner", href: "/lesson-plan", icon: BookOpen },
    { label: "Assignment Maker", href: "/assignment", icon: FileText },
    { label: "Conducted History", href: "/history", icon: History },
    { label: "Paper Grader", href: "/grade", icon: GraduationCap },
    { label: "My Profile", href: "/profile", icon: UserCircle },
  ];

  const studentNav = [
    { label: "Exam Arena", href: "/student", icon: ShieldCheck },
    { label: "My History", href: "/student-history", icon: History },
    { label: "My Profile", href: "/profile", icon: UserCircle },
  ];

  const currentNav = isStudentPerspective ? studentNav : teacherNav;

  const handleExitToLogin = () => {
    logout();
    setLocation("/auth");
  };

  return (
    <div className="flex h-screen w-screen bg-[#030712] text-slate-100 overflow-hidden font-sans">
      {/* Sidebar with Distinct Surface */}
      <aside className="w-64 border-r border-slate-800/80 bg-[#0a101f] flex flex-col justify-between shrink-0 shadow-2xl">
        <div className="p-5 space-y-6 overflow-y-auto">
          {/* Brand Header */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-brand-600 to-brand-400 flex items-center justify-center shadow-lg shadow-brand-500/25 shrink-0 border border-brand-400/20">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <div className="min-w-0">
              <h1 className="font-extrabold text-base text-white tracking-wider font-serif uppercase truncate">
                THE BIG CLASSES
              </h1>
              <p className="text-[11px] font-semibold text-brand-400 truncate">
                {isStudentPerspective ? "Student Arena" : "Faculty Command"}
              </p>
            </div>
          </div>

          {/* Navigation Links - 100% PURE WHITE TEXT & ICONS */}
          <nav className="space-y-2 pt-2">
            {currentNav.map((item) => {
              const isActive = location === item.href || (item.href === "/student" && location === "/student-portal");
              return (
                <Link key={item.href} href={item.href}>
                  <div
                    style={{
                      // Driven by the user's chosen accent (see lib/theme.tsx)
                      backgroundColor: isActive ? "rgb(var(--brand-600))" : "transparent",
                      border: isActive ? "1px solid rgb(var(--brand-400))" : "1px solid transparent",
                    }}
                    className={`flex items-center gap-3.5 px-4 py-3 rounded-xl cursor-pointer transition-all duration-150 ${
                      isActive
                        ? "shadow-lg shadow-brand-600/40"
                        : "hover:bg-slate-800/70"
                    }`}
                  >
                    <item.icon 
                      style={{ color: "#ffffff" }}
                      className="w-5 h-5 shrink-0" 
                    />
                    <span 
                      style={{ color: "#ffffff" }}
                      className={`text-sm tracking-wide leading-none ${isActive ? "font-bold" : "font-semibold"}`}
                    >
                      {item.label}
                    </span>
                  </div>
                </Link>
              );
            })}
          </nav>
        </div>

        {/* Sidebar Footer */}
        <div className="p-4 border-t border-slate-800/80 bg-[#060b17] space-y-3">
          <button
            onClick={handleExitToLogin}
            className="w-full py-2.5 px-3 rounded-xl border border-slate-700 bg-slate-800/60 text-xs font-semibold text-white hover:bg-slate-800 flex items-center justify-center gap-2 transition-all shadow-sm"
          >
            <LogOut className="w-3.5 h-3.5 text-red-400" />
            <span>Switch Role / Logout</span>
          </button>

          {user && (
            <Link href="/profile">
              <div className="px-2 pt-3 border-t border-slate-800/60 flex items-center gap-2.5 cursor-pointer rounded-lg hover:bg-slate-800/40 -mx-1 px-1 py-2 transition-colors">
                <div className="w-9 h-9 rounded-full bg-brand-600/25 border border-brand-400/40 flex items-center justify-center shrink-0">
                  <span className="text-[11px] font-extrabold text-brand-200">{initialsOf(user.name)}</span>
                </div>
                <div className="min-w-0">
                  <p className="font-bold text-white text-xs truncate">{user.name}</p>
                  <p className="text-[11px] text-slate-300 truncate font-mono">{user.email}</p>
                  <p className="text-[10px] font-semibold text-brand-300 uppercase tracking-wider">
                    {user.role === "teacher" ? "Faculty" : "Student"} • View profile
                  </p>
                </div>
              </div>
            </Link>
          )}
        </div>
      </aside>

      {/* Main Screen Container */}
      <main className="flex-1 overflow-y-auto bg-[#030712] p-6 lg:p-10">
        <div className="max-w-7xl mx-auto">
          {children}
        </div>
      </main>
    </div>
  );
}
