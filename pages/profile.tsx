import { useEffect, useState } from "react";
import { updatePassword, updateProfile, sendPasswordResetEmail } from "firebase/auth";
import { doc, setDoc } from "firebase/firestore";
import { auth, db } from "../lib/firebase";
import { useAuth } from "../lib/auth-context";
import { backgroundsForMode, THEME_PRESETS, normalizeHex, useTheme, type LayoutMode } from "../lib/theme";
import { getCandidateHistory } from "../lib/room-store";
import { useGetClassroomHistory } from "../lib/api-client";
import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import {
  UserCircle,
  Mail,
  ShieldCheck,
  Palette,
  KeyRound,
  CheckCircle2,
  AlertCircle,
  Loader2,
  LogOut,
  RotateCcw,
  GraduationCap,
} from "lucide-react";

function initialsOf(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

const LAYOUT_MODES: { key: LayoutMode; label: string; hint: string }[] = [
  { key: "studio", label: "Studio", hint: "Dark chrome, light pages" },
  { key: "dark", label: "Dark", hint: "Everything dark" },
  { key: "light", label: "Light", hint: "Everything light" },
];

function friendlyError(err: any): string {
  switch (err?.code) {
    case "auth/weak-password":
      return "Password should be at least 6 characters.";
    case "auth/requires-recent-login":
      return "For security, please log out and log back in before changing your password.";
    case "auth/invalid-email":
      return "That email address doesn't look valid.";
    case "permission-denied":
      return "Firestore rejected the update. Your account may be missing profile permissions.";
    default:
      return err?.message || "Something went wrong. Please try again.";
  }
}

/** Small inline status line used across the profile cards. */
function StatusLine({ error, success }: { error: string; success: string }) {
  if (error) {
    return (
      <p className="text-xs font-semibold text-danger-ink bg-danger-soft border border-danger-line p-2.5 rounded-lg flex items-start gap-1.5">
        <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" /> {error}
      </p>
    );
  }
  if (success) {
    return (
      <p className="text-xs font-semibold text-success-ink bg-success-soft border border-success-line p-2.5 rounded-lg flex items-start gap-1.5">
        <CheckCircle2 className="w-3.5 h-3.5 mt-0.5 shrink-0" /> {success}
      </p>
    );
  }
  return null;
}

export function Profile() {
  const { user, logout } = useAuth();
  const { selection, setPreset, setCustomAccent, setMode, setBackground, resetTheme } = useTheme();

  const isTeacher = user?.role === "teacher";

  const [name, setName] = useState(user?.name || "");
  const [savingName, setSavingName] = useState(false);
  const [nameError, setNameError] = useState("");
  const [nameSuccess, setNameSuccess] = useState("");

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);
  const [passwordError, setPasswordError] = useState("");
  const [passwordSuccess, setPasswordSuccess] = useState("");
  const [resetSent, setResetSent] = useState(false);

  const [customHex, setCustomHex] = useState(selection.hex);

  // Keep the field in sync when the auth profile resolves/changes underneath us.
  useEffect(() => {
    setName(user?.name || "");
  }, [user?.name]);

  useEffect(() => {
    if (selection.key === "custom") setCustomHex(selection.hex);
  }, [selection]);

  // --- quick stats ---------------------------------------------------------
  const { data: generatedContent } = useGetClassroomHistory(user?.id);

  const [attemptCount, setAttemptCount] = useState<number | null>(null);
  const [bestPercentage, setBestPercentage] = useState<number | null>(null);

  useEffect(() => {
    if (isTeacher || !user?.email) return;
    let cancelled = false;
    getCandidateHistory(user.email)
      .then((rows) => {
        if (cancelled) return;
        setAttemptCount(rows.length);
        const percentages = rows.map((r) => r.percentage ?? 0).filter((p) => p > 0);
        setBestPercentage(percentages.length ? Math.max(...percentages) : 0);
      })
      .catch((err) => console.error("Failed to load attempt stats:", err));
    return () => {
      cancelled = true;
    };
  }, [isTeacher, user?.email]);

  const handleSaveName = async (e: React.FormEvent) => {
    e.preventDefault();
    setNameError("");
    setNameSuccess("");

    const clean = name.trim();
    if (!clean) {
      setNameError("Name can't be empty.");
      return;
    }
    if (!auth.currentUser) {
      setNameError("You are not signed in.");
      return;
    }

    setSavingName(true);
    try {
      await updateProfile(auth.currentUser, { displayName: clean });
      // Mirror into the users doc so the directory/roster stays readable.
      await setDoc(doc(db, "users", auth.currentUser.uid), { name: clean }, { merge: true });
      setNameSuccess("Profile name updated.");
    } catch (err) {
      setNameError(friendlyError(err));
    } finally {
      setSavingName(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError("");
    setPasswordSuccess("");

    if (newPassword.length < 6) {
      setPasswordError("Password should be at least 6 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError("The two passwords don't match.");
      return;
    }
    if (!auth.currentUser) {
      setPasswordError("You are not signed in.");
      return;
    }

    setSavingPassword(true);
    try {
      await updatePassword(auth.currentUser, newPassword);
      setNewPassword("");
      setConfirmPassword("");
      setPasswordSuccess("Password changed. Use it the next time you log in.");
    } catch (err) {
      setPasswordError(friendlyError(err));
    } finally {
      setSavingPassword(false);
    }
  };

  const handleSendResetEmail = async () => {
    setPasswordError("");
    setPasswordSuccess("");
    if (!user?.email) return;
    try {
      await sendPasswordResetEmail(auth, user.email);
      setResetSent(true);
    } catch (err) {
      setPasswordError(friendlyError(err));
    }
  };

  const handleCustomHex = (value: string) => {
    setCustomHex(value);
    const normalized = normalizeHex(value);
    if (normalized) setCustomAccent(normalized);
  };

  const stats = isTeacher
    ? [
        { label: "Generated items", value: generatedContent ? String(generatedContent.length) : "—" },
        { label: "Role", value: "Faculty" },
      ]
    : [
        { label: "Exams attempted", value: attemptCount === null ? "—" : String(attemptCount) },
        { label: "Best score", value: bestPercentage === null ? "—" : `${bestPercentage}%` },
      ];

  const memberSince = auth.currentUser?.metadata?.creationTime
    ? new Date(auth.currentUser.metadata.creationTime).toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : "—";

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center gap-4">
        <div className="w-12 h-12 rounded-2xl bg-brand-600/20 border border-brand-500/30 flex items-center justify-center text-brand-ink shrink-0">
          <UserCircle className="w-6 h-6" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-ink tracking-tight">My Profile</h1>
          <p className="text-ink-muted text-sm">
            {isTeacher
              ? "Manage your faculty identity, appearance and account security."
              : "Manage your student identity, appearance and account security."}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Identity -------------------------------------------------------- */}
        <Card className="p-6 border-line bg-surface/90 shadow-2xl rounded-2xl space-y-5">
          <div className="flex items-center gap-2 text-sm font-bold text-ink">
            <ShieldCheck className="w-4 h-4 text-brand-ink" /> Identity
          </div>

          <div className="flex items-center gap-4 p-4 rounded-2xl bg-surface-2 border border-line">
            <div className="w-14 h-14 rounded-full bg-brand-600/25 border border-brand-400/40 flex items-center justify-center shrink-0">
              <span className="text-base font-extrabold text-brand-ink">{initialsOf(user?.name || "")}</span>
            </div>
            <div className="min-w-0">
              <p className="font-bold text-ink truncate">{user?.name}</p>
              <p className="text-xs text-ink-muted truncate flex items-center gap-1.5">
                <Mail className="w-3 h-3" /> {user?.email}
              </p>
              <span className="inline-flex items-center gap-1.5 mt-1.5 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-brand-600/20 text-brand-ink border border-brand-500/30">
                <GraduationCap className="w-3 h-3" />
                {isTeacher ? "Faculty Account" : "Student Account"}
              </span>
            </div>
          </div>

          <form onSubmit={handleSaveName} className="space-y-3">
            <div>
              <label className="block text-[11px] font-bold text-ink-soft uppercase tracking-wider mb-1.5">
                Display name
              </label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your full name"
                className="bg-surface-2 border-line-strong text-ink h-11 rounded-xl"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-ink-soft uppercase tracking-wider mb-1.5">
                Login email
              </label>
              <Input
                value={user?.email || ""}
                readOnly
                disabled
                className="bg-surface-2/60 border-line text-ink-muted h-11 rounded-xl cursor-not-allowed"
              />
              <p className="text-[11px] text-ink-muted mt-1.5">
                Your email is your exam identity and can't be changed here.
              </p>
            </div>

            <StatusLine error={nameError} success={nameSuccess} />

            <Button
              type="submit"
              disabled={savingName}
              className="w-full bg-brand-600 hover:bg-brand-500 text-on-brand font-bold h-11 rounded-xl disabled:opacity-60 flex items-center justify-center gap-2"
            >
              {savingName ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              {savingName ? "Saving..." : "Save changes"}
            </Button>
          </form>

          <div className="grid grid-cols-2 gap-3 pt-1">
            {stats.map((stat) => (
              <div key={stat.label} className="p-3 rounded-xl bg-surface-2 border border-line">
                <p className="text-[10px] font-bold uppercase tracking-wider text-ink-muted">{stat.label}</p>
                <p className="text-lg font-extrabold text-brand-ink font-mono">{stat.value}</p>
              </div>
            ))}
          </div>

          <p className="text-[11px] text-ink-muted">Member since {memberSince}</p>
        </Card>

        {/* Appearance ------------------------------------------------------ */}
        <Card className="p-6 border-line bg-surface/90 shadow-2xl rounded-2xl space-y-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-bold text-ink">
              <Palette className="w-4 h-4 text-brand-ink" /> Appearance
            </div>
            <button
              type="button"
              onClick={resetTheme}
              className="text-[11px] font-semibold text-ink-muted hover:text-ink inline-flex items-center gap-1.5"
            >
              <RotateCcw className="w-3 h-3" /> Reset all
            </button>
          </div>

          <p className="text-xs text-ink-muted">
            Choose the layout, the background and the accent colour. Everything is remembered on this
            device and on your account.
          </p>

          {/* Layout mode */}
          <div className="space-y-2.5">
            <p className="text-[11px] font-bold uppercase tracking-wider text-ink-soft">Layout</p>
            <div className="grid grid-cols-3 gap-2">
              {LAYOUT_MODES.map((mode) => {
                const isActive = selection.mode === mode.key;
                return (
                  <button
                    key={mode.key}
                    type="button"
                    title={mode.hint}
                    onClick={() => setMode(mode.key)}
                    className={`p-2.5 rounded-xl border text-left transition-all ${
                      isActive
                        ? "bg-brand-600/20 border-brand-500 text-ink shadow-lg shadow-brand-500/10"
                        : "bg-surface-3 border-line text-ink-soft hover:bg-surface-4 hover:text-ink"
                    }`}
                  >
                    <span className="block text-xs font-bold">{mode.label}</span>
                    <span className="block text-[10px] leading-tight mt-0.5 opacity-80">{mode.hint}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Background */}
          <div className="space-y-2.5">
            <p className="text-[11px] font-bold uppercase tracking-wider text-ink-soft">Background</p>
            <div className="flex flex-wrap gap-2">
              {backgroundsForMode(selection.mode).map((option) => {
                const isActive = selection.background === option.key;
                return (
                  <button
                    key={option.key}
                    type="button"
                    onClick={() => setBackground(option.key)}
                    className={`px-3 py-1.5 rounded-lg text-[11px] font-bold border transition-all ${
                      isActive
                        ? "bg-brand-600 border-brand-400 text-on-brand"
                        : "bg-surface-3 border-line text-ink-soft hover:bg-surface-4 hover:text-ink"
                    }`}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Accent */}
          <div className="space-y-2.5">
            <p className="text-[11px] font-bold uppercase tracking-wider text-ink-soft">Accent colour</p>
          <div className="grid grid-cols-4 sm:grid-cols-6 gap-3">
            {THEME_PRESETS.map((preset) => {
              const isActive = selection.key === preset.key;
              return (
                <button
                  key={preset.key}
                  type="button"
                  title={preset.label}
                  onClick={() => setPreset(preset.key)}
                  className={`h-11 rounded-xl border-2 transition-all flex items-center justify-center ${
                    isActive ? "border-white scale-105 shadow-lg" : "border-transparent hover:scale-105"
                  }`}
                  style={{ background: preset.swatch }}
                >
                  {isActive && <CheckCircle2 className="w-4 h-4 text-ink drop-shadow" />}
                </button>
              );
            })}
          </div>

          </div>

          <div className="p-4 rounded-2xl bg-surface-2 border border-line space-y-3">
            <p className="text-[11px] font-bold uppercase tracking-wider text-ink-soft">Any colour you like</p>
            <div className="flex items-center gap-3">
              <input
                type="color"
                value={normalizeHex(customHex) || "#2563eb"}
                onChange={(e) => handleCustomHex(e.target.value)}
                className="w-12 h-11 rounded-lg bg-transparent border border-line-strong cursor-pointer"
                aria-label="Pick a custom accent colour"
              />
              <Input
                value={customHex}
                onChange={(e) => handleCustomHex(e.target.value)}
                placeholder="#2563eb"
                className="bg-surface border-line-strong text-ink h-11 rounded-xl font-mono"
              />
            </div>
            <p className="text-[11px] text-ink-muted">
              Tip: a mid-dark shade keeps buttons readable with white text.
            </p>
          </div>

          {/* Live preview */}
          <div className="p-4 rounded-2xl bg-surface-2 border border-line space-y-3">
            <p className="text-[11px] font-bold uppercase tracking-wider text-ink-soft">Preview</p>
            <div className="flex flex-wrap items-center gap-2">
              <span
                className="px-3 py-1.5 rounded-lg text-xs font-bold text-on-brand"
                style={{ background: "rgb(var(--brand-600))" }}
              >
                Primary action
              </span>
              <span className="px-3 py-1.5 rounded-lg text-xs font-bold border" style={{ borderColor: "rgb(var(--brand-400))", color: "rgb(var(--brand-300))" }}>
                Outline
              </span>
              <span className="px-3 py-1.5 rounded-lg text-xs font-bold" style={{ background: "rgb(var(--brand-600) / 0.2)", color: "rgb(var(--brand-300))" }}>
                Soft badge
              </span>
              <span className="w-3 h-3 rounded-full" style={{ background: "rgb(var(--brand-500))" }} />
              <span className="w-3 h-3 rounded-full" style={{ background: "rgb(var(--brand-700))" }} />
            </div>

            {/* Surfaces, so the background choice is visible before committing */}
            <div className="flex flex-wrap items-center gap-2 pt-1">
              {[
                { label: "App", cls: "bg-app text-ink border-line" },
                { label: "Sidebar", cls: "bg-sidebar text-ink border-line" },
                { label: "Surface", cls: "bg-surface text-ink border-line" },
                { label: "Paper", cls: "bg-paper text-paper-ink border-paper-line" },
              ].map((chip) => (
                <span
                  key={chip.label}
                  className={`px-2.5 py-1 rounded-md text-[10px] font-bold border ${chip.cls}`}
                >
                  {chip.label}
                </span>
              ))}
            </div>
          </div>
        </Card>

        {/* Security -------------------------------------------------------- */}
        <Card className="p-6 border-line bg-surface/90 shadow-2xl rounded-2xl space-y-5 lg:col-span-2">
          <div className="flex items-center gap-2 text-sm font-bold text-ink">
            <KeyRound className="w-4 h-4 text-brand-ink" /> Password & session
          </div>

          <form onSubmit={handleChangePassword} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-[11px] font-bold text-ink-soft uppercase tracking-wider mb-1.5">
                New password
              </label>
              <Input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="••••••••"
                className="bg-surface-2 border-line-strong text-ink h-11 rounded-xl"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-ink-soft uppercase tracking-wider mb-1.5">
                Confirm password
              </label>
              <Input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="••••••••"
                className="bg-surface-2 border-line-strong text-ink h-11 rounded-xl"
              />
            </div>

            <div className="sm:col-span-2 space-y-3">
              <StatusLine error={passwordError} success={passwordSuccess} />
              {resetSent && !passwordError && (
                <StatusLine error="" success={`Password reset link sent to ${user?.email}.`} />
              )}

              <div className="flex flex-col sm:flex-row gap-3">
                <Button
                  type="submit"
                  disabled={savingPassword}
                  className="bg-brand-600 hover:bg-brand-500 text-on-brand font-bold h-11 rounded-xl px-6 disabled:opacity-60 flex items-center justify-center gap-2"
                >
                  {savingPassword ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                  {savingPassword ? "Updating..." : "Update password"}
                </Button>

                <Button
                  type="button"
                  onClick={handleSendResetEmail}
                  variant="outline"
                  className="border-line-strong bg-surface-3 text-ink hover:bg-surface-4 hover:text-ink font-semibold h-11 rounded-xl px-6"
                >
                  Email me a reset link
                </Button>
              </div>

              <p className="text-[11px] text-ink-muted">
                For your safety Firebase may ask you to log in again before a password change — the reset link
                always works.
              </p>
            </div>
          </form>

          <div className="pt-4 border-t border-line flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div>
              <p className="text-sm font-bold text-ink">Sign out of this device</p>
              <p className="text-xs text-ink-muted">You'll be returned to the role selection screen.</p>
            </div>
            <Button
              type="button"
              onClick={() => logout()}
              variant="outline"
              className="border-danger-line bg-danger-soft text-danger-ink hover:brightness-125 font-semibold h-11 rounded-xl px-6 flex items-center gap-2"
            >
              <LogOut className="w-4 h-4" /> Log out
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
}
