import React, { useEffect, useState } from "react";
import { Trans, useTranslation } from "react-i18next";
import { ChevronDown, ChevronUp, RotateCcw } from "lucide-react";
import { commands } from "@/bindings";
import { Textarea } from "@/components/ui";
import { useSettings } from "../../../hooks/useSettings";

const CLEAN_PROMPT_ID = "default_improve_transcriptions";

export const BaselineSection: React.FC = () => {
  const { t } = useTranslation();
  const { settings, refreshSettings } = useSettings();
  const [editorOpen, setEditorOpen] = useState(false);
  const [draftText, setDraftText] = useState("");
  const [resetting, setResetting] = useState(false);

  const cleanPrompt = settings?.post_process_prompts?.find(
    (p) => p.id === CLEAN_PROMPT_ID,
  );
  const transcribeBinding =
    settings?.bindings?.["transcribe"]?.current_binding ?? "";

  useEffect(() => {
    if (cleanPrompt) setDraftText(cleanPrompt.prompt);
  }, [cleanPrompt?.prompt]);

  const handleBlur = async () => {
    if (!cleanPrompt || draftText.trim() === cleanPrompt.prompt.trim()) return;
    try {
      await commands.updatePostProcessPrompt(
        CLEAN_PROMPT_ID,
        cleanPrompt.name,
        draftText.trim(),
      );
      await refreshSettings();
    } catch (err) {
      console.error("Failed to update clean prompt:", err);
    }
  };

  const handleReset = async () => {
    setResetting(true);
    try {
      const r = await commands.resetCleanPrompt();
      if (r.status === "ok") await refreshSettings();
    } catch (err) {
      console.error("Failed to reset clean prompt:", err);
    } finally {
      setResetting(false);
    }
  };

  return (
    <div className="space-y-3">
      <p className="text-sm text-text-2 leading-relaxed">
        {t("settings.postProcessing.baseline.description")}
      </p>
      <button
        type="button"
        className="flex items-center gap-1.5 text-sm text-accent hover:text-accent/80 transition-colors"
        onClick={() => setEditorOpen((p) => !p)}
      >
        {editorOpen ? (
          <ChevronUp className="w-3.5 h-3.5" />
        ) : (
          <ChevronDown className="w-3.5 h-3.5" />
        )}
        {t("settings.postProcessing.baseline.viewEdit")}
      </button>
      {editorOpen && (
        <div className="space-y-2">
          <Textarea
            value={draftText}
            onChange={(e) => setDraftText(e.target.value)}
            onBlur={handleBlur}
            placeholder={t("settings.postProcessing.baseline.placeholder")}
            className="min-h-[100px]"
          />
          <p className="text-xs text-mid-gray/70">
            <Trans
              i18nKey="settings.postProcessing.prompts.promptTip"
              components={{ code: <code /> }}
            />
          </p>
          <button
            type="button"
            className="inline-flex items-center gap-1.5 text-xs text-text-3 hover:text-text-2 transition-colors disabled:opacity-50"
            onClick={handleReset}
            disabled={resetting}
          >
            <RotateCcw className="w-3 h-3" />
            {t("settings.postProcessing.baseline.resetToDefault")}
          </button>
        </div>
      )}
      {transcribeBinding && (
        <div className="flex items-center gap-2 text-xs text-text-3">
          <span>{t("settings.postProcessing.baseline.runsOn")}</span>
          <span className="rounded-md border border-mid-gray/40 px-1.5 py-0.5 font-mono text-[10px]">
            {transcribeBinding}
          </span>
          <span className="text-text-3/60">
            {t("settings.postProcessing.baseline.changeInGeneral")}
          </span>
        </div>
      )}
    </div>
  );
};
