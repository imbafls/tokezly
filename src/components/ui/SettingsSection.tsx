import React, { useState } from "react";
import { ChevronRight } from "lucide-react";

interface SettingsSectionProps {
  sectionNumber?: number;
  title: string;
  summaryChip?: string;
  hotkeyChip?: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}

export const SettingsSection: React.FC<SettingsSectionProps> = ({
  sectionNumber,
  title,
  summaryChip,
  hotkeyChip,
  children,
  defaultOpen = false,
}) => {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  return (
    <div className="rounded-xl border border-mid-gray/20 bg-surface-2/30">
      <button
        type="button"
        className={`w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-mid-gray/5 cursor-pointer transition-colors duration-150 rounded-t-xl ${isOpen ? "" : "rounded-b-xl"}`}
        onClick={() => setIsOpen((p) => !p)}
        aria-expanded={isOpen}
      >
        {sectionNumber !== undefined && (
          <span className="shrink-0 text-[11px] font-semibold text-text-3 w-4 text-center">
            {sectionNumber}
          </span>
        )}
        <span className="text-[11px] font-semibold uppercase tracking-wide text-text-3 flex-1 min-w-0">
          {title}
        </span>
        {summaryChip && (
          <span className="shrink-0 text-[11px] text-text-3 font-medium">
            {summaryChip}
          </span>
        )}
        {hotkeyChip && (
          <span className="shrink-0 rounded-md border border-mid-gray/40 px-1.5 py-0.5 text-[10px] font-mono text-text-3">
            {hotkeyChip}
          </span>
        )}
        <ChevronRight
          className={`shrink-0 w-4 h-4 text-text-3 transition-transform duration-200 ${isOpen ? "rotate-90" : ""}`}
        />
      </button>
      {isOpen && (
        <div className="px-4 pb-4 pt-1 space-y-3 border-t border-mid-gray/20">
          {children}
        </div>
      )}
    </div>
  );
};
