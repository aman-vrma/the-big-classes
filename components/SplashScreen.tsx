import { useState, useEffect } from "react";

export function SplashScreen({ onFinish }: { onFinish: () => void }) {
  const [fadingOut, setFadingOut] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setFadingOut(true);
      setTimeout(onFinish, 500);
    }, 2300);

    return () => clearTimeout(timer);
  }, [onFinish]);

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 999999,
        background: "radial-gradient(circle at 50% 40%, #FFF9EE 0%, #FBF3E3 100%)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
        userSelect: "none",
        opacity: fadingOut ? 0 : 1,
        transform: fadingOut ? "scale(1.05)" : "scale(1)",
        transition: "opacity 0.5s cubic-bezier(0.4, 0, 0.2, 1), transform 0.5s cubic-bezier(0.4, 0, 0.2, 1)",
      }}
    >
      <style>{`
        @keyframes shardFly {
          0% { opacity: 0; transform: translate(var(--fx), var(--fy)) rotate(var(--fr)) scale(0.5); }
          70% { opacity: 1; }
          100% { opacity: 1; transform: translate(0,0) rotate(0) scale(1); }
        }
        @keyframes ringPop {
          from { opacity: 0; transform: scale(0); }
          to { opacity: 1; transform: scale(1); }
        }
        @keyframes ringPulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(201,98,42,0.3); }
          50% { box-shadow: 0 0 0 12px rgba(201,98,42,0); }
        }
        @keyframes wordRise {
          from { opacity: 0; transform: translateY(14px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .sp-shard { position: absolute; opacity: 0; animation: shardFly 0.7s cubic-bezier(0.22, 1, 0.36, 1) forwards; }
        .sp-ring {
          position: absolute; width: 46px; height: 46px; border-radius: 50%;
          border: 3px solid #C9622A; opacity: 0;
          animation: ringPop 0.5s ease-out 0.75s forwards, ringPulse 2s ease-in-out 1.3s infinite;
        }
        .sp-wordmark { opacity: 0; animation: wordRise 0.7s cubic-bezier(0.16,1,0.3,1) 0.95s forwards; }
      `}</style>

      <div style={{ position: "relative", width: "220px", height: "220px", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <svg className="sp-shard" style={{ "--fx": "-160px", "--fy": "-120px", "--fr": "-40deg", animationDelay: "0.1s" } as any} width="60" height="60" viewBox="0 0 60 60">
          <path d="M30 5 L55 20 L30 30 L5 20 Z" fill="#2E5FA3" />
        </svg>
        <svg className="sp-shard" style={{ "--fx": "170px", "--fy": "-100px", "--fr": "35deg", animationDelay: "0.2s" } as any} width="50" height="50" viewBox="0 0 50 50">
          <rect x="5" y="20" width="40" height="8" rx="2" fill="#3E8E5C" />
        </svg>
        <svg className="sp-shard" style={{ "--fx": "-150px", "--fy": "130px", "--fr": "50deg", animationDelay: "0.3s" } as any} width="46" height="46" viewBox="0 0 46 46">
          <circle cx="23" cy="23" r="18" fill="none" stroke="#E8B23D" strokeWidth="4" />
        </svg>
        <svg className="sp-shard" style={{ "--fx": "160px", "--fy": "140px", "--fr": "-45deg", animationDelay: "0.4s" } as any} width="34" height="60" viewBox="0 0 34 60">
          <rect x="14" y="0" width="6" height="45" fill="#2E5FA3" />
          <path d="M4 45h26l-2 12H6z" fill="#D9622A" />
        </svg>
        <svg className="sp-shard" style={{ "--fx": "0px", "--fy": "-170px", "--fr": "20deg", animationDelay: "0.5s" } as any} width="30" height="30" viewBox="0 0 30 30">
          <path d="M15 2l4 9 10 1-7.5 7 2 10-8.5-5.5L6.5 29l2-10L1 12l10-1z" fill="#E8B23D" />
        </svg>
        <div className="sp-ring" />
      </div>

      <div className="sp-wordmark" style={{ position: "relative", top: "20px", textAlign: "center" }}>
        <div style={{ fontFamily: "'Fraunces', serif", fontWeight: 600, fontSize: "46px", color: "#2B2620", lineHeight: 1 }}>
          THE BIG
        </div>
        <div style={{ fontFamily: "'Fraunces', serif", fontWeight: 600, fontSize: "46px", color: "#C9622A", lineHeight: 1 }}>
          CLASSES
        </div>
        <div style={{ fontSize: "11px", letterSpacing: "0.15em", color: "#8A8272", marginTop: "10px", fontWeight: 700 }}>
          LEARN · ASSESS · GROW
        </div>
      </div>
    </div>
  );
}