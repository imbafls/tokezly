import { listen } from "@tauri-apps/api/event";
import React, { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import "./RecordingOverlay.css";
import { commands } from "@/bindings";
import i18n, { syncLanguageFromSettings } from "@/i18n";
import { getLanguageDirection } from "@/lib/utils/rtl";

type OverlayState = "recording" | "transcribing" | "processing";

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

const RecordingOverlay: React.FC = () => {
  const { t } = useTranslation();
  const [isVisible, setIsVisible] = useState(false);
  const [state, setState] = useState<OverlayState>("recording");
  const [levels, setLevels] = useState<number[]>(Array(NUM_BARS).fill(0));
  const [elapsed, setElapsed] = useState(0);
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

  const renderSurface = () => {
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
          <span className="timer">{elapsed.toFixed(1)}s</span>
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
            {isRefine ? "Gemma 3 4B" : "Parakeet V3"}
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
