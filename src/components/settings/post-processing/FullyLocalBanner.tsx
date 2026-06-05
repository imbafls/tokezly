import React from "react";
import { useTranslation } from "react-i18next";
import { ShieldCheck } from "lucide-react";
import { useSettings } from "../../../hooks/useSettings";

/// Id of the in-process on-device refinement provider (mirrors the Rust
/// `ON_DEVICE_PROVIDER_ID`).
const ON_DEVICE_PROVIDER_ID = "on_device";

// "Fully Local" reassurance banner. The default AI Rewrite provider is the
// local Ollama endpoint (localhost:11434), cloud is opt-in.
export const FullyLocalBanner: React.FC = () => {
  const { t } = useTranslation();
  const { settings } = useSettings();
  // Only truthful for the in-process on-device engine. Cloud providers — and
  // Claude via the local Claude Code CLI — send text off the machine, so the
  // "fully local" claim must not show for them.
  if (settings?.post_process_provider_id !== ON_DEVICE_PROVIDER_ID) {
    return null;
  }
  return (
    <div className="flex items-center gap-3.5 px-4 py-3 rounded-xl border border-green-500/30 bg-green-500/[0.08]">
      <span className="shrink-0 text-green-400">
        <ShieldCheck className="w-5 h-5" />
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-green-400">
          {t("settings.postProcessing.fullyLocal.title")}
        </p>
        <p className="text-xs text-text-2 mt-0.5 leading-relaxed">
          {t("settings.postProcessing.fullyLocal.description")}
        </p>
      </div>
      <span className="shrink-0 rounded-full border border-green-500/35 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-green-400">
        {t("settings.postProcessing.fullyLocal.badge")}
      </span>
    </div>
  );
};
