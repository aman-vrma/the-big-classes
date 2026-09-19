import { useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "../lib/auth-context";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { ArrowLeft, ArrowRight, Lock, Mail, User } from "lucide-react";

function friendlyFirebaseError(code: string): string {
  switch (code) {
    case "auth/invalid-email":
      return "That email address doesn't look valid.";
    case "auth/user-not-found":
      return "No account found with this email. Try signing up first.";
    case "auth/wrong-password":
    case "auth/invalid-credential":
      return "Incorrect email or password.";
    case "auth/email-already-in-use":
      return "An account with this email already exists. Try logging in instead.";
    case "auth/weak-password":
      return "Password should be at least 6 characters.";
    case "auth/too-many-requests":
      return "Too many attempts. Please wait a bit and try again.";
    default:
      return "Something went wrong. Please try again.";
  }
}

export function AuthPage() {
  const [, setLocation] = useLocation();
  const { login, signup, logout } = useAuth();

  const [activeStep, setActiveStep] = useState<"select" | "auth">("select");
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [selectedRole, setSelectedRole] = useState<"teacher" | "student">("teacher");
  const [hoverRole, setHoverRole] = useState<"teacher" | "student" | null>(null);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const displayRole = hoverRole || selectedRole;

  const handleSelectRole = (role: "teacher" | "student") => {
    setSelectedRole(role);
    setErrorMsg("");
    setSuccessMsg("");
    setEmail("");
    setPassword("");
    setConfirmPassword("");
    setName("");
    setMode("login");
    setActiveStep("auth");
  };

  const switchMode = (next: "login" | "signup") => {
    setMode(next);
    setErrorMsg("");
    setSuccessMsg("");
    setPassword("");
    setConfirmPassword("");
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg("");
    setSuccessMsg("");

    if (!email.trim() || !password.trim() || (mode === "signup" && !name.trim())) {
      setErrorMsg("Please fill in all fields.");
      return;
    }

    if (mode === "signup") {
      if (password.length < 6) {
        setErrorMsg("Password should be at least 6 characters.");
        return;
      }
      if (password !== confirmPassword) {
        setErrorMsg("The two passwords don't match.");
        return;
      }
    }

    setSubmitting(true);
    try {
      if (mode === "signup") {
        // Creating the account deliberately does NOT sign the user in — they are
        // sent back to the login form so they enter with the credentials they
        // just chose (and so a typo can't lock them into a session they can't
        // reproduce).
        await signup(name.trim(), email.trim(), password, selectedRole);
        setMode("login");
        setPassword("");
        setConfirmPassword("");
        setSuccessMsg(`Account created for ${email.trim()}. Log in below to continue.`);
      } else {
        const actualRole = await login(email.trim(), password);
        if (actualRole !== selectedRole) {
          await logout();
          const correctCard = actualRole === "teacher" ? "Teacher" : "Student";
          setErrorMsg(`This account is registered as a ${correctCard} account. Please go back and choose "${correctCard}" instead.`);
          return;
        }
        setLocation(actualRole === "teacher" ? "/" : "/student");
      }
    } catch (err: any) {
      setErrorMsg(friendlyFirebaseError(err?.code || ""));
    } finally {
      setSubmitting(false);
    }
  };

  const accent = selectedRole === "teacher" ? "#2E5FA3" : "#D9622A";

  return (
    <div
      style={{
        minHeight: "100vh",
        background:
          activeStep === "select"
            ? displayRole === "teacher"
              ? "linear-gradient(135deg, #EFF5FF 0%, #FEFEFC 45%, #FFFBF3 100%)"
              : displayRole === "student"
              ? "linear-gradient(135deg, #FBFCFF 0%, #FEFEFC 45%, #FFF3E9 100%)"
              : "linear-gradient(135deg, #FBFCFF 0%, #FEFEFC 45%, #FFFBF3 100%)"
            : "linear-gradient(135deg, #FBFCFF 0%, #FEFEFC 45%, #FFFBF3 100%)",
        transition: "background 0.6s ease",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px",
        fontFamily: "'Manrope', sans-serif",
        position: "relative",
        overflow: "hidden",
      }}
    >
      <style>{`
        .ap-grid {
          position: absolute; inset: 0; opacity: 0.5; pointer-events: none;
          background-image: linear-gradient(#EEF0F4 1px, transparent 1px), linear-gradient(90deg, #EEF0F4 1px, transparent 1px);
          background-size: 42px 42px;
        }
        .ap-opt {
          display: flex; align-items: center; gap: 16px; padding: 18px 20px;
          background: #fff; border: 1.5px solid #ECE7DC; border-radius: 16px;
          cursor: pointer; transition: all 0.25s ease; text-align: left; width: 100%;
        }
        .ap-opt:hover, .ap-opt.active { transform: translateY(-2px); }
        .ap-opt .arrow { margin-left: auto; opacity: 0; transform: translateX(-6px); transition: all 0.25s ease; }
        .ap-opt:hover .arrow { opacity: 1; transform: translateX(0); }
        .ap-illo { position: absolute; opacity: 0; transform: scale(0.94) translateY(10px); transition: all 0.45s cubic-bezier(0.22,1,0.36,1); width: 100%; max-width: 360px; }
        .ap-illo.show { opacity: 1; transform: scale(1) translateY(0); }
        @media (max-width: 900px) { .ap-right { display: none; } }
      `}</style>

      <div className="ap-grid" />

      {activeStep === "select" && (
        <div style={{ display: "flex", alignItems: "center", gap: 60, maxWidth: 1000, width: "100%", position: "relative", zIndex: 2, flexWrap: "wrap", justifyContent: "center" }}>
          <div style={{ flex: "1 1 380px", maxWidth: 420 }}>
            <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.12em", color: "#B0855F", textTransform: "uppercase", marginBottom: 10 }}>
              The Big Classes
            </div>
            <h1 style={{ fontFamily: "'Fraunces', serif", fontWeight: 600, fontSize: 42, color: "#2B2620", lineHeight: 1.1, marginBottom: 10 }}>
              Who are<br />you?
            </h1>
            <p style={{ fontSize: 14, color: "#8A8272", marginBottom: 30, lineHeight: 1.5 }}>
              Choose your role to enter the right workspace — everything ahead is tailored to it.
            </p>

            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div
                className={`ap-opt ${hoverRole === "teacher" ? "active" : ""}`}
                style={{ borderColor: hoverRole === "teacher" ? "#2E5FA3" : undefined, boxShadow: hoverRole === "teacher" ? "0 8px 20px rgba(46,95,163,0.15)" : undefined }}
                onMouseEnter={() => setHoverRole("teacher")}
                onMouseLeave={() => setHoverRole(null)}
                onClick={() => handleSelectRole("teacher")}
              >
                <div style={{ width: 46, height: 46, borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(46,95,163,0.1)", flexShrink: 0 }}>
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#2E5FA3" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M4 6.5L12 3l8 3.5-8 3.5-8-3.5z" />
                    <path d="M8 9v5c0 1.5 2 3 4 3s4-1.5 4-3V9" />
                  </svg>
                </div>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 16, color: "#2B2620" }}>I'm a Teacher</div>
                  <div style={{ fontSize: 12.5, color: "#9C9483", marginTop: 2 }}>Create exams, track results, manage your class</div>
                </div>
                <svg className="arrow" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#2E5FA3" strokeWidth="2">
                  <path d="M5 12h14M13 5l7 7-7 7" />
                </svg>
              </div>

              <div
                className={`ap-opt ${hoverRole === "student" ? "active" : ""}`}
                style={{ borderColor: hoverRole === "student" ? "#D9622A" : undefined, boxShadow: hoverRole === "student" ? "0 8px 20px rgba(217,98,42,0.15)" : undefined }}
                onMouseEnter={() => setHoverRole("student")}
                onMouseLeave={() => setHoverRole(null)}
                onClick={() => handleSelectRole("student")}
              >
                <div style={{ width: 46, height: 46, borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(217,98,42,0.1)", flexShrink: 0 }}>
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#D9622A" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 3L2 8l10 5 10-5-10-5z" />
                    <path d="M6 10.5v5c0 1.5 3 3.5 6 3.5s6-2 6-3.5v-5" />
                  </svg>
                </div>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 16, color: "#2B2620" }}>I'm a Student</div>
                  <div style={{ fontSize: 12.5, color: "#9C9483", marginTop: 2 }}>Join exams, view results, track your progress</div>
                </div>
                <svg className="arrow" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#D9622A" strokeWidth="2">
                  <path d="M5 12h14M13 5l7 7-7 7" />
                </svg>
              </div>
            </div>
          </div>

          <div className="ap-right" style={{ flex: "1 1 380px", position: "relative", height: 420, display: "flex", alignItems: "center", justifyContent: "center" }}>
            {!hoverRole && (
              <div style={{ textAlign: "center", color: "#C9BFA8", fontSize: 13 }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="#C9BFA8" strokeWidth="1.2" style={{ width: 90, height: 90, margin: "0 auto 14px", opacity: 0.5 }}>
                  <circle cx="12" cy="12" r="9" />
                  <path d="M9 10h.01M15 10h.01M9 16c1-1 2-1.5 3-1.5s2 .5 3 1.5" />
                </svg>
                Hover an option to preview
              </div>
            )}

            <svg className={`ap-illo ${hoverRole === "teacher" ? "show" : ""}`} viewBox="0 0 380 380">
              <ellipse cx="190" cy="345" rx="150" ry="14" fill="#F0EAD9" />
              <rect x="185" y="40" width="165" height="110" rx="8" fill="#EDEFF4" stroke="#B9C4DB" strokeWidth="2" />
              <rect x="200" y="58" width="60" height="10" rx="4" fill="#9FB3D6" />
              <rect x="200" y="76" width="90" height="10" rx="4" fill="#D9622A" opacity="0.55" />
              <rect x="200" y="94" width="75" height="10" rx="4" fill="#3E8E5C" opacity="0.55" />
              <circle cx="320" cy="120" r="12" fill="#E8B23D" opacity="0.7" />
              <path d="M200,118 l25,-15 15,8 25,-20" stroke="#2E5FA3" strokeWidth="4" fill="none" strokeLinecap="round" opacity="0.6" />
              <rect x="35" y="290" width="30" height="34" rx="4" fill="#D9622A" opacity="0.25" />
              <path d="M50 292c-10 -20 -4 -40 0 -46c4 6 10 26 0 46z" fill="#3E8E5C" opacity="0.55" />
              <path d="M50 292c8 -18 4 -34 2 -40c-3 5 -8 22 -2 40z" fill="#2F6B4F" opacity="0.55" />
              <rect x="150" y="255" width="34" height="85" rx="10" fill="#22385E" />
              <rect x="196" y="255" width="34" height="85" rx="10" fill="#1B2E4C" />
              <rect x="146" y="330" width="42" height="20" rx="8" fill="#12233F" />
              <rect x="192" y="330" width="42" height="20" rx="8" fill="#12233F" />
              <path d="M148 190c0 -20 22 -32 42 -32s42 12 42 32v72c0 13 -18 20 -42 20s-42 -7 -42 -20v-72z" fill="#2E5FA3" />
              <path d="M148 190c0 -20 22 -32 42 -32v124c-24 0 -42 -7 -42 -20v-72z" fill="#26538F" />
              <path d="M180 162l10 14 10 -14v-6h-20z" fill="#F4EFE6" />
              <path d="M222 178c20 -8 46 -20 60 -27" stroke="#26538F" strokeWidth="24" strokeLinecap="round" />
              <ellipse cx="285" cy="149" rx="13" ry="13" fill="#E8B89C" />
              <path d="M158 195c-8 14 -10 34 -8 50" stroke="#2E5FA3" strokeWidth="24" strokeLinecap="round" />
              <ellipse cx="148" cy="248" rx="13" ry="13" fill="#E8B89C" />
              <rect x="182" y="140" width="16" height="18" rx="6" fill="#E8B89C" />
              <ellipse cx="190" cy="118" rx="30" ry="32" fill="#E8B89C" />
              <circle cx="180" cy="114" r="3.5" fill="#2B2620" />
              <circle cx="200" cy="114" r="3.5" fill="#2B2620" />
              <path d="M179 130q11 8 22 0" stroke="#8A5A3A" strokeWidth="2.5" fill="none" strokeLinecap="round" />
              <path d="M159 108c-2 -24 14 -38 31 -38s33 14 31 38c-6 -10 -20 -14 -31 -14s-25 4 -31 14z" fill="#3A2A1E" />
              <path d="M159 108c1 -10 4 -18 9 -24c-3 8 -3 18 0 26z" fill="#3A2A1E" />
            </svg>

            <svg className={`ap-illo ${hoverRole === "student" ? "show" : ""}`} viewBox="0 0 380 380">
              <ellipse cx="190" cy="345" rx="150" ry="14" fill="#F0EAD9" />
              <rect x="290" y="300" width="50" height="10" rx="2" fill="#2E5FA3" opacity="0.4" />
              <rect x="294" y="290" width="42" height="10" rx="2" fill="#3E8E5C" opacity="0.4" />
              <rect x="298" y="280" width="34" height="10" rx="2" fill="#D9622A" opacity="0.4" />
              <rect x="55" y="205" width="230" height="16" rx="6" fill="#C9A876" />
              <rect x="65" y="221" width="14" height="60" fill="#B0855F" />
              <rect x="255" y="221" width="14" height="60" fill="#B0855F" />
              <rect x="150" y="110" width="110" height="80" rx="8" fill="#F4EFE6" stroke="#2E5FA3" strokeWidth="3" />
              <rect x="164" y="126" width="40" height="10" rx="5" fill="#2E5FA3" opacity="0.55" />
              <rect x="164" y="144" width="70" height="10" rx="5" fill="#C9BFA8" />
              <rect x="164" y="162" width="55" height="10" rx="5" fill="#C9BFA8" />
              <rect x="196" y="190" width="20" height="14" fill="#2E5FA3" opacity="0.4" />
              <rect x="90" y="260" width="14" height="60" fill="#B0855F" opacity="0.7" />
              <rect x="190" y="260" width="14" height="60" fill="#B0855F" opacity="0.7" />
              <rect x="105" y="225" width="30" height="72" rx="12" fill="#B8471E" />
              <rect x="163" y="225" width="30" height="72" rx="12" fill="#A03D19" />
              <rect x="98" y="288" width="44" height="20" rx="9" fill="#5A1F05" />
              <rect x="156" y="288" width="44" height="20" rx="9" fill="#5A1F05" />
              <path d="M96 148c0 -19 21 -30 40 -30s40 11 40 30v70c0 12 -18 19 -40 19s-40 -7 -40 -19v-70z" fill="#D9622A" />
              <path d="M96 148c0 -19 21 -30 40 -30v119c-22 0 -40 -7 -40 -19v-70z" fill="#C9551D" />
              <path d="M126 121l10 13 10 -13v-5h-20z" fill="#F4EFE6" />
              <path d="M170 155c14 6 27 15 35 25" stroke="#C9551D" strokeWidth="22" strokeLinecap="round" />
              <ellipse cx="207" cy="185" rx="12" ry="12" fill="#E8A374" />
              <path d="M104 155c-10 12 -14 28 -13 42" stroke="#D9622A" strokeWidth="22" strokeLinecap="round" />
              <ellipse cx="93" cy="200" rx="12" ry="12" fill="#E8A374" />
              <rect x="126" y="100" width="16" height="16" rx="6" fill="#E8A374" />
              <ellipse cx="134" cy="80" rx="29" ry="31" fill="#E8A374" />
              <circle cx="124" cy="76" r="3.5" fill="#3A1A05" />
              <circle cx="144" cy="76" r="3.5" fill="#3A1A05" />
              <path d="M123 92q11 8 22 0" stroke="#8A3A1A" strokeWidth="2.5" fill="none" strokeLinecap="round" />
              <path d="M105 78c-4 -26 12 -42 30 -42s32 14 31 36c-5 -14 -18 -18 -30 -18c-5 8 -3 18 -1 26c-5 -4 -12 -6 -18 -6c-5 6 -8 12 -12 4z" fill="#241608" />
            </svg>
          </div>
        </div>
      )}

      {activeStep === "auth" && (
        <div style={{ maxWidth: 420, width: "100%", position: "relative", zIndex: 2 }}>
          <div style={{ background: "#fff", border: "1.5px solid #ECE7DC", borderRadius: 20, padding: 32, boxShadow: "0 20px 50px rgba(60,50,30,0.08)" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 22 }}>
              <button
                type="button"
                onClick={() => setActiveStep("select")}
                style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 700, color: "#9C9483", background: "none", border: "none", cursor: "pointer" }}
              >
                <ArrowLeft className="w-3.5 h-3.5" /> Back
              </button>
              <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", padding: "5px 10px", borderRadius: 100, background: `${accent}14`, color: accent }}>
                {selectedRole === "teacher" ? "Teacher" : "Student"}
              </span>
            </div>

            <h2 style={{ fontFamily: "'Fraunces', serif", fontWeight: 600, fontSize: 26, color: "#2B2620", marginBottom: 4 }}>
              {mode === "login" ? "Welcome back" : "Create your account"}
            </h2>
            <p style={{ fontSize: 13, color: "#9C9483", marginBottom: 22 }}>
              {selectedRole === "teacher" ? "Faculty workspace access" : "Student exam workspace access"}
            </p>

            <div style={{ display: "flex", borderRadius: 12, overflow: "hidden", border: "1.5px solid #ECE7DC", marginBottom: 20 }}>
              <button
                type="button"
                onClick={() => switchMode("login")}
                style={{ flex: 1, padding: "10px 0", fontSize: 13, fontWeight: 700, border: "none", cursor: "pointer", background: mode === "login" ? accent : "#FAFAF7", color: mode === "login" ? "#fff" : "#9C9483" }}
              >
                Log In
              </button>
              <button
                type="button"
                onClick={() => switchMode("signup")}
                style={{ flex: 1, padding: "10px 0", fontSize: 13, fontWeight: 700, border: "none", cursor: "pointer", background: mode === "signup" ? accent : "#FAFAF7", color: mode === "signup" ? "#fff" : "#9C9483" }}
              >
                Sign Up
              </button>
            </div>

            <form onSubmit={handleFormSubmit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {mode === "signup" && (
                <div>
                  <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#8A8272", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>
                    Full Name
                  </label>
                  <div style={{ position: "relative" }}>
                    <User style={{ position: "absolute", left: 14, top: 14, width: 16, height: 16, color: "#B0A996" }} />
                    <Input
                      required
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="e.g. Aman Verma"
                      className="pl-10 h-11 text-sm rounded-xl"
                      style={{ background: "#FBFAF7", border: "1.5px solid #ECE7DC", color: "#2B2620" }}
                    />
                  </div>
                </div>
              )}

              <div>
                <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#8A8272", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>
                  Email Address
                </label>
                <div style={{ position: "relative" }}>
                  <Mail style={{ position: "absolute", left: 14, top: 14, width: 16, height: 16, color: "#B0A996" }} />
                  <Input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="name@example.com"
                    className="pl-10 h-11 text-sm rounded-xl"
                    style={{ background: "#FBFAF7", border: "1.5px solid #ECE7DC", color: "#2B2620" }}
                  />
                </div>
              </div>

              <div>
                <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#8A8272", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>
                  Password
                </label>
                <div style={{ position: "relative" }}>
                  <Lock style={{ position: "absolute", left: 14, top: 14, width: 16, height: 16, color: "#B0A996" }} />
                  <Input
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="pl-10 h-11 text-sm rounded-xl"
                    style={{ background: "#FBFAF7", border: "1.5px solid #ECE7DC", color: "#2B2620" }}
                  />
                </div>
              </div>

              {mode === "signup" && (
                <div>
                  <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#8A8272", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>
                    Confirm Password
                  </label>
                  <div style={{ position: "relative" }}>
                    <Lock style={{ position: "absolute", left: 14, top: 14, width: 16, height: 16, color: "#B0A996" }} />
                    <Input
                      type="password"
                      required
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="••••••••"
                      className="pl-10 h-11 text-sm rounded-xl"
                      style={{ background: "#FBFAF7", border: "1.5px solid #ECE7DC", color: "#2B2620" }}
                    />
                  </div>
                </div>
              )}

              {errorMsg && (
                <p style={{ fontSize: 12, fontWeight: 600, color: "#B8471E", background: "#FDF1EC", border: "1px solid #F3D7C6", padding: 10, borderRadius: 10 }}>
                  {errorMsg}
                </p>
              )}

              {successMsg && (
                <p style={{ fontSize: 12, fontWeight: 600, color: "#256B47", background: "#EFFAF3", border: "1px solid #C6EBD6", padding: 10, borderRadius: 10 }}>
                  {successMsg}
                </p>
              )}

              <Button
                type="submit"
                disabled={submitting}
                style={{ background: accent, borderColor: accent }}
                className="w-full py-3 h-11 font-bold text-sm rounded-xl text-white hover:opacity-90 disabled:opacity-60 transition-all flex items-center justify-center gap-2"
              >
                {submitting ? "Please wait..." : mode === "signup" ? "Create Account" : "Log In"} <ArrowRight className="w-4 h-4" />
              </Button>
            </form>

            <div style={{ marginTop: 18, paddingTop: 16, borderTop: "1px solid #F2EFE6", textAlign: "center" }}>
              <p style={{ fontSize: 11, color: "#B0A996" }}>
                {mode === "login"
                  ? "Don't have an account? Click Sign Up above — you'll log in with it right after."
                  : "Creating an account takes you back to the login form, so you can sign in with the password you choose."}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
