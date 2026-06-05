import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { CheckCircle2, ShieldCheck } from "lucide-react";
import { commands } from "@/bindings";
import { useSettings } from "../../../hooks/useSettings";

/// Id of the provider that routes refinement through the local Claude Code CLI
/// (mirrors the Rust `CLAUDE_CODE_PROVIDER_ID`). When active, the page shows a
/// status card indicating whether Claude Code is installed and signed in.
const CLAUDE_CODE_PROVIDER_ID = "claude_code";

// Status card for the Claude Code provider. Shown only when it's the active
// refinement provider. Reports whether the local `claude` CLI is installed and
// signed in, since the rewrite falls back to verbatim if it isn't.
export const ClaudeCodeCard: React.FC = () => {
  const { t } = useTranslation();
  const { settings } = useSettings();
  const [available, setAvailable] = useState<boolean | null>(null);

  const isActive =
    settings?.post_process_provider_id === CLAUDE_CODE_PROVIDER_ID;

  useEffect(() => {
    if (!isActive) return;
    let cancelled = false;
    void (async () => {
      try {
        const ok = await commands.isClaudeCodeAvailable();
        if (!cancelled) setAvailable(ok);
      } catch {
        if (!cancelled) setAvailable(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isActive]);

  if (!isActive) return null;

  return (
    <div className="flex items-center gap-4 px-4 py-3.5 rounded-xl border border-line bg-surface-2/60">
      <span className={`shrink-0 ${available ? "text-accent" : "text-text-2"}`}>
        <ShieldCheck className="w-5 h-5" />
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-text">
          {t("settings.postProcessing.claudeCode.title")}
        </p>
        <p className="text-xs text-text-3 mt-0.5 leading-relaxed">
          {available === false
            ? t("settings.postProcessing.claudeCode.unavailable")
            : t("settings.postProcessing.claudeCode.description")}
        </p>
      </div>
      {available !== null && (
        <div className="shrink-0">
          <span
            className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${
              available
                ? "border-accent/35 text-accent"
                : "border-line text-text-3"
            }`}
          >
            {available && <CheckCircle2 className="w-3.5 h-3.5" />}
            {available
              ? t("settings.postProcessing.claudeCode.ready")
              : t("settings.postProcessing.claudeCode.notFound")}
          </span>
        </div>
      )}
    </div>
  );
};
