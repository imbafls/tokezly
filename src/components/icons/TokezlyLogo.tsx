/* eslint-disable i18next/no-literal-string -- brand wordmark, not translatable copy */
import React from "react";

interface TokezlyLogoProps {
  width?: number | string;
  height?: number | string;
  className?: string;
}

/// The Tokezly wordmark: "tokez" in the neutral text color with the "ly" tail
/// in the brand mint-teal -> blue gradient. Set in Space Grotesk (bundled).
const TokezlyLogo: React.FC<TokezlyLogoProps> = ({ width = 120, className }) => (
  <svg
    width={width}
    viewBox="0 0 150 34"
    fill="none"
    className={className}
    role="img"
    aria-label="Tokezly"
  >
    <defs>
      <linearGradient id="tokezly-ly" x1="0" y1="1" x2="1" y2="0">
        <stop offset="0" stopColor="#2fe0a6" />
        <stop offset="1" stopColor="#38b6f2" />
      </linearGradient>
    </defs>
    <text
      x="0"
      y="26"
      fontFamily="'Space Grotesk', system-ui, sans-serif"
      fontSize="29"
      fontWeight="600"
      letterSpacing="-1"
      fill="#e9f2ee"
    >
      tokez<tspan fill="url(#tokezly-ly)">ly</tspan>
    </text>
  </svg>
);

export default TokezlyLogo;
