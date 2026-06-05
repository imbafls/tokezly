import { listen } from "@tauri-apps/api/event";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import React, { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import "./RecordingOverlay.css";
import { commands } from "@/bindings";
import i18n, { syncLanguageFromSettings } from "@/i18n";
import { getLanguageDirection } from "@/lib/utils/rtl";

type OverlayState = "recording" | "transcribing" | "processing" | "toast";

/// Rewrite mode carried by the `paste-complete` event; labels the result card.
type PasteMode = "verbatim" | "cleaned" | "prompt";

interface PasteCompletePayload {
  mode: PasteMode;
  text: string;
  engine: string;
}

/// How long the result card stays before auto-dismissing, reset on each
/// interaction (Copy/Retry). The ✕ dismisses immediately; a new recording
/// replaces it. Kept short since the card sits over the cursor area.
const CARD_AUTODISMISS_MS = 6000;

/// How long the Copy button shows its "Copied" confirmation before reverting.
const COPIED_REVERT_MS = 1500;

const NUM_BARS = 16;

/* WinUI-style ProgressRing */
const Ring: React.FC<{ size?: number }> = ({ size = 15 }) => (
  <svg
    className="spinner"
    style={{ width: size, height: size }}
    viewBox="0 0 24 24"
    fill="none"
  >
    <circle
      className="spin-rot"
      cx="12"
      cy="12"
      r="8.5"
      strokeWidth="2.6"
      strokeLinecap="round"
      strokeDasharray="20 40"
    />
  </svg>
);

const SparkleIcon: React.FC = () => (
  <svg
    className="sparkle"
    width="13"
    height="13"
    viewBox="0 0 24 24"
    fill="none"
  >
    <path
      d="M12 3.2c.5 3.6 1.9 5 5.5 5.5-3.6.5-5 1.9-5.5 5.5-.5-3.6-1.9-5-5.5-5.5 3.6-.5 5-1.9 5.5-5.5Z"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinejoin="round"
    />
  </svg>
);

const XIcon: React.FC = () => (
  <svg viewBox="0 0 24 24" fill="none">
    <path
      d="M6 6l12 12M18 6 6 18"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
    />
  </svg>
);

const CheckIcon: React.FC = () => (
  <svg viewBox="0 0 24 24" fill="none">
    <path
      d="M5 12.5 10 17.5 19 7"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const RecordingOverlay: React.FC = () => {
  const { t } = useTranslation();
  const [isVisible, setIsVisible] = useState(false);
  const [state, setState] = useState<OverlayState>("recording");
  const [levels, setLevels] = useState<number[]>(Array(NUM_BARS).fill(0));
  const [elapsed, setElapsed] = useState(0);
  const [pasteMode, setPasteMode] = useState<PasteMode>("cleaned");
  const [pasteText, setPasteText] = useState("");
  const [pasteEngine, setPasteEngine] = useState("");
  const [copied, setCopied] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);
  // Bumped on each card interaction to restart the auto-dismiss timer.
  const [interactions, setInteractions] = useState(0);
  const smoothedLevelsRef = useRef<number[]>(Array(NUM_BARS).fill(0));
  const direction = getLanguageDirection(i18n.language);

  useEffect(() => {
    const setup = async () => {
      const unlistenShow = await listen("show-overlay", async (event) => {
        await syncLanguageFromSettings();
        setState(event.payload as OverlayState);
        setIsVisible(true);
      });
      const unlistenHide = await listen("hide-overlay", () => {
        setIsVisible(false);
      });
      const unlistenPaste = await listen<PasteCompletePayload>(
        "paste-complete",
        (event) => {
          setPasteMode(event.payload.mode);
          setPasteText(event.payload.text);
          setPasteEngine(event.payload.engine);
          setCopied(false);
          setIsRetrying(false);
          setInteractions((n) => n + 1);
          setState("toast");
          setIsVisible(true);
        },
      );
      const unlistenLevel = await listen<number[]>("mic-level", (event) => {
        const incoming = event.payload as number[];
        const smoothed = smoothedLevelsRef.current.map((prev, i) => {
          const target = incoming[i] || 0;
          return prev * 0.7 + target * 0.3;
        });
        smoothedLevelsRef.current = smoothed;
        setLevels(smoothed.slice(0, NUM_BARS));
      });
      return () => {
        unlistenShow();
        unlistenHide();
        unlistenPaste();
        unlistenLevel();
      };
    };
    setup();
  }, []);

  // Elapsed timer runs only while the listening capsule is on screen.
  useEffect(() => {
    if (isVisible && state === "recording") {
      setElapsed(0);
      const id = setInterval(
        () => setElapsed((e) => Math.round((e + 0.1) * 10) / 10),
        100,
      );
      return () => clearInterval(id);
    }
  }, [isVisible, state]);

  // The result card auto-dismisses after a quiet interval. The timer restarts
  // on every interaction (`interactions`) and is cleared if the state changes
  // (e.g. a new recording starts), so a stale timer never hides a fresh capsule.
  useEffect(() => {
    if (isVisible && state === "toast") {
      const id = setTimeout(() => {
        void commands.dismissOverlay();
      }, CARD_AUTODISMISS_MS);
      return () => clearTimeout(id);
    }
  }, [isVisible, state, interactions]);

  const handleCopy = async () => {
    setInteractions((n) => n + 1);
    try {
      await writeText(pasteText);
      setCopied(true);
      window.setTimeout(() => setCopied(false), COPIED_REVERT_MS);
    } catch {
      // Clipboard write can fail (e.g. locked clipboard); leave the label as-is.
    }
  };

  const handleRetry = () => {
    if (isRetrying) return; // guard against a double-Retry → duplicate paste
    setCopied(false);
    setIsRetrying(true);
    setInteractions((n) => n + 1);
    // The fresh result re-emits paste-complete, which clears isRetrying; the
    // .finally guards the error path (no paste-complete) so the button recovers.
    void commands.retryLastDictation().finally(() => setIsRetrying(false));
  };

  const handleDismiss = () => {
    void commands.dismissOverlay();
  };

  const renderSurface = () => {
    if (state === "toast") {
      return (
        <div className="card">
          <div className="card-head">
            <span className="checkwrap">
              <CheckIcon />
            </span>
            <span className="card-mode">
              {t(`overlay.pasteMode.${pasteMode}`)}
            </span>
            {pasteEngine && <span className="card-eng">{pasteEngine}</span>}
            <button
              type="button"
              className="card-x"
              title={t("overlay.dismiss")}
              onClick={handleDismiss}
            >
              <XIcon />
            </button>
          </div>
          <div className="card-text" title={pasteText}>
            {pasteText}
          </div>
          <div className="card-actions">
            <button
              type="button"
              className="card-btn"
              onClick={handleCopy}
              disabled={isRetrying}
            >
              {copied ? t("overlay.copied") : t("overlay.copy")}
            </button>
            <button
              type="button"
              className="card-btn"
              onClick={handleRetry}
              disabled={isRetrying}
            >
              {t("overlay.retry")}
            </button>
          </div>
        </div>
      );
    }

    if (state === "recording") {
      return (
        <div className="cap">
          <span className="reddot" />
          <span className="cap-lbl">REC</span>
          <div className="wave">
            {levels.map((v, i) => (
              <span
                key={i}
                className="b"
                style={{
                  height: `${Math.min(20, 3 + Math.pow(v, 0.7) * 17)}px`,
                  opacity: Math.max(0.25, v * 1.6),
                }}
              />
            ))}
          </div>
          <span className="timer">{`${elapsed.toFixed(1)}s`}</span>
          <div
            className="cap-cancel"
            title="Cancel"
            onClick={() => commands.cancelOperation()}
          >
            <XIcon />
          </div>
        </div>
      );
    }

    // transcribing | processing → streaming popup
    const isRefine = state === "processing";
    return (
      <div className={`pop${isRefine ? " accent" : ""}`}>
        <span className="top-accent" />
        <div className="pop-head">
          <Ring size={15} />
          <span className="pop-ttl">
            {isRefine && <SparkleIcon />}
            {isRefine ? t("overlay.processing") : t("overlay.transcribing")}
          </span>
          <span className="pop-eng">
            <span className="dot" />
            {isRefine ? "Gemma 2 2B" : "Parakeet V3"}
          </span>
        </div>
      </div>
    );
  };

  return (
    <div
      dir={direction}
      className={`overlay-root ${isVisible ? "visible" : ""}`}
    >
      <div className="overlay-surface">{renderSurface()}</div>
    </div>
  );
};

export default RecordingOverlay;
