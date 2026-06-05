import React from "react";
import { useTranslation } from "react-i18next";
import { Sparkles } from "lucide-react";
import { useSettings } from "../../../hooks/useSettings";

// Master on/off card for the whole AI Rewrite feature, bound to the existing
// `post_process_enabled` setting. Styled as the design's prominent ".ai-master"
// banner rather than a plain settings row.
export const AiRewriteMasterToggle: React.FC = () => {
  const { t } = useTranslation();
  const { getSetting, updateSetting, isUpdating } = useSettings();
  const enabled = getSetting("post_process_enabled") || false;
  const updating = isUpdating("post_process_enabled");

  return (
    <div className="flex items-center gap-4 px-4 py-3.5 rounded-xl border border-accent/40 bg-accent/[0.07]">
      <span className="shrink-0 text-accent">
        <Sparkles className="w-5 h-5" />
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-text">
          {t("settings.postProcessing.master.title")}
        </p>
        <p className="text-xs text-text-3 mt-0.5 leading-relaxed">
          {t("settings.postProcessing.master.description")}
        </p>
      </div>
      <label
        className={`relative inline-flex items-center ${updating ? "cursor-not-allowed" : "cursor-pointer"}`}
      >
        <input
          type="checkbox"
          className="sr-only peer"
          checked={enabled}
          disabled={updating}
          onChange={(e) =>
            updateSetting("post_process_enabled", e.target.checked)
          }
        />
        <div className="relative w-11 h-6 bg-surface-3 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-accent rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-accent peer-disabled:opacity-50" />
      </label>
    </div>
  );
};
