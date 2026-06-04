import React from "react";

interface MarkProps {
  width?: number | string;
  height?: number | string;
  className?: string;
}

/// The Tokezly app mark: a rounded gradient tile holding the voice-waveform
/// glyph ("a spoken token"). Used as the onboarding hero and the general nav
/// icon. Scales cleanly from a favicon to a hero.
const TokezlyMark: React.FC<MarkProps> = ({ width, height, className }) => (
  <svg
    width={width || 126}
    height={height || width || 126}
    viewBox="0 0 32 32"
    fill="none"
    className={className}
    xmlns="http://www.w3.org/2000/svg"
    role="img"
    aria-label="Tokezly"
  >
    <defs>
      <linearGradient id="tokezly-mark-grad" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#3ce8a8" />
        <stop offset="0.5" stopColor="#25cdc8" />
        <stop offset="1" stopColor="#36b4f2" />
      </linearGradient>
    </defs>
    <rect x="1.5" y="1.5" width="29" height="29" rx="8.5" fill="url(#tokezly-mark-grad)" />
    <path
      d="M8.5 16h2.6M13.7 10.5v11M17.7 13v6M21.4 11.5v9M25 16h-0.2"
      stroke="#04110d"
      strokeWidth="2.5"
      strokeLinecap="round"
    />
  </svg>
);

export default TokezlyMark;
