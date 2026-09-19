import { useEffect, useState, useCallback, useRef } from "react";

interface ProctorOptions {
  maxViolations?: number;
  onAutoSubmit?: () => void;
  enabled?: boolean;
  /** Room PIN — required so violations can be reported to the server. */
  roomCode?: string;
}

export type ViolationReason =
  | "tab_switch"
  | "window_blur"
  | "fullscreen_exit"
  | "devtools"
  | "paste"
  | "copy"
  | "shortcut"
  | "resize";

interface ProctorState {
  violations: number;
  warningMessage: string | null;
  /** True once the 3rd strike is recorded (the server owns disqualification). */
  disqualified: boolean;
  /** True while fullscreen is active. */
  isFullscreen: boolean;
  reportViolation: (reason: ViolationReason, friendlyText?: string) => void;
  clearWarning: () => void;
  resetViolations: () => void;
  enterFullscreen: () => void;
  exitFullscreen: () => void;
}

const VIOLATION_LABELS: Record<ViolationReason, string> = {
  tab_switch: "Tab switch or minimization detected",
  window_blur: "Window lost focus — stay on the exam screen",
  fullscreen_exit: "You left fullscreen — return to the exam",
  devtools: "Developer tools are not allowed during the exam",
  paste: "Pasting is blocked during the exam",
  copy: "Copying exam content is blocked",
  shortcut: "Unauthorized shortcut blocked",
  resize: "Suspicious window resize detected",
};

export function useProctor({
  maxViolations = 3,
  onAutoSubmit,
  enabled = false,
  roomCode = "",
}: ProctorOptions): ProctorState {
  const [violations, setViolations] = useState(0);
  const [warningMessage, setWarningMessage] = useState<string | null>(null);
  const [disqualified, setDisqualified] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Refs so the native listeners below never need to be re-attached, and so the
  // report callback always reads fresh values instead of stale closures.
  const stateRef = useRef({ enabled, roomCode, violations, submitting: false });
  useEffect(() => {
    stateRef.current = { ...stateRef.current, enabled, roomCode, violations };
  }, [enabled, roomCode, violations]);

  const autoSubmitRef = useRef(onAutoSubmit);
  useEffect(() => {
    autoSubmitRef.current = onAutoSubmit;
  }, [onAutoSubmit]);

  const reportViolation = useCallback(
    (reason: ViolationReason, friendlyText?: string) => {
      const s = stateRef.current;
      if (!s.enabled || s.submitting) return;

      // Optimistic UI so the warning appears instantly; the server's count is
      // authoritative and reconciles this when the response arrives.
      const next = s.violations + 1;
      stateRef.current = { ...s, violations: next };
      setViolations(next);
      setWarningMessage(`Warning ${next}/${maxViolations}: ${friendlyText || VIOLATION_LABELS[reason]}`);
      if (next >= maxViolations) setDisqualified(true);

      // The SERVER counts the strike. The number this device shows is only a
      // mirror — a tampered client can no longer hide its own strikes.
      (async () => {
        try {
          const { getAuthHeaders } = await import("../lib/firebase");
          const res = await fetch("/api/report-violation", {
            method: "POST",
            headers: { "Content-Type": "application/json", ...(await getAuthHeaders()) },
            body: JSON.stringify({ roomCode: s.roomCode, reason }),
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data?.error || "Failed to report violation");

          // Reconcile with the server's authoritative count.
          const serverViolations = Number(data.violations) || 0;
          stateRef.current = { ...stateRef.current, violations: serverViolations };
          setViolations(serverViolations);

          if (data.status === "disqualified") {
            setDisqualified(true);
            s.submitting = true;
            autoSubmitRef.current?.();
          }
        } catch (err) {
          // Network hiccup: keep the optimistic count. The server still saw the
          // request or didn't — either way the next report re-syncs the count.
          console.error("Failed to report violation:", err);
        } finally {
          s.submitting = false;
        }
      })();
    },
    [maxViolations]
  );

  useEffect(() => {
    if (!enabled) return;

    let devtoolsOpen = false;

    // 1. Tab switch & minimization (fires on `document`, not `window`)
    const handleVisibilityChange = () => {
      if (document.hidden) reportViolation("tab_switch");
    };

    // 2. Window blur (Alt+Tab, clicking outside)
    const handleWindowBlur = () => reportViolation("window_blur");

    // 3. Fullscreen: exiting is a strike (exam runs fullscreen).
    const handleFullscreenChange = () => {
      const active = !!document.fullscreenElement;
      setIsFullscreen(active);
      if (!active && stateRef.current.enabled) reportViolation("fullscreen_exit");
    };

    // 4. Right-click disabled
    const handleContextMenu = (e: MouseEvent) => e.preventDefault();

    // 5. Copy/paste/inspect/print shortcuts
    const handleKeyDown = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      if (
        (e.ctrlKey && ["c", "v", "x", "a", "u", "s", "p"].includes(key)) ||
        e.key === "F12" ||
        (e.ctrlKey && e.shiftKey && ["i", "j", "c"].includes(key)) ||
        // Meta key (macOS Cmd) equivalents
        (e.metaKey && ["c", "v", "x", "a"].includes(key))
      ) {
        e.preventDefault();
        reportViolation("shortcut");
      }
    };

    // 6. Clipboard: block paste entirely; block copy/cut of exam content.
    const handlePaste = (e: ClipboardEvent) => {
      e.preventDefault();
      reportViolation("paste");
    };
    const handleCopy = (e: ClipboardEvent) => {
      e.preventDefault();
      reportViolation("copy");
    };

    // 7. DevTools heuristic: outer-vs-inner window size delta. Catches the
    //    common docked-devtools case; not perfect, but one honest signal.
    const handleDevtoolsCheck = () => {
      const threshold = 220;
      const open =
        window.outerWidth - window.innerWidth > threshold ||
        window.outerHeight - window.innerHeight > threshold;
      if (open && !devtoolsOpen) reportViolation("devtools");
      devtoolsOpen = open;
    };
    const devtoolsInterval = setInterval(handleDevtoolsCheck, 1500);

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("blur", handleWindowBlur);
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    document.addEventListener("contextmenu", handleContextMenu);
    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("paste", handlePaste);
    document.addEventListener("copy", handleCopy);

    return () => {
      clearInterval(devtoolsInterval);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("blur", handleWindowBlur);
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
      document.removeEventListener("contextmenu", handleContextMenu);
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("paste", handlePaste);
      document.removeEventListener("copy", handleCopy);
    };
  }, [enabled, reportViolation]);

  // Best effort: browsers usually allow this right after the Start click.
  const enterFullscreen = useCallback(() => {
    const el = document.documentElement;
    if (el.requestFullscreen) {
      el.requestFullscreen().catch(() => {
        /* browser refused — the exam still runs, exit still counts as a strike */
      });
    }
  }, []);

  const exitFullscreen = useCallback(() => {
    if (document.fullscreenElement && document.exitFullscreen) {
      document.exitFullscreen().catch(() => {
        /* ignore */
      });
    }
  }, []);

  const clearWarning = () => setWarningMessage(null);

  const resetViolations = useCallback(() => {
    setViolations(0);
    setWarningMessage(null);
    setDisqualified(false);
  }, []);

  return {
    violations,
    warningMessage,
    clearWarning,
    resetViolations,
    disqualified,
    isFullscreen,
    reportViolation,
    enterFullscreen,
    exitFullscreen,
  };
}

