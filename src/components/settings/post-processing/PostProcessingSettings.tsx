import React from "react";
import { useTranslation } from "react-i18next";
import { SettingsSection } from "@/components/ui";
import { AiRewriteMasterToggle } from "./AiRewriteMasterToggle";
import { BaselineSection } from "./BaselineSection";
import { LibrarySection } from "./LibrarySection";
import { EngineSection } from "./EngineSection";
import { useSettings } from "../../../hooks/useSettings";

const CLEAN_PROMPT_ID = "default_improve_transcriptions";

export const PostProcessingSettings: React.FC = () => {
  const { t } = useTranslation();
  const { getSetting, settings } = useSettings();
  const enabled = getSetting("post_process_enabled") || false;

  const transcribeBinding =
    settings?.bindings?.["transcribe"]?.current_binding ?? "";
  const promptBinding =
    settings?.bindings?.["transcribe_with_post_process"]?.current_binding ?? "";
  const allPrompts = getSetting("post_process_prompts") || [];
  const libraryPrompts = allPrompts.filter((p) => p.id !== CLEAN_PROMPT_ID);
  const selectedPromptId = getSetting("post_process_selected_prompt_id") || "";
  const armedPrompt = libraryPrompts.find((p) => p.id === selectedPromptId);
  const providerId = settings?.post_process_provider_id ?? "on_device";
  const providerLabel =
    settings?.post_process_providers?.find((p) => p.id === providerId)?.label ??
    providerId;

  return (
    <div className="max-w-3xl w-full mx-auto space-y-5">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">
          {t("settings.postProcessing.title")}
        </h1>
        <p className="text-sm text-text-3 mt-1 leading-relaxed">
          {t("settings.postProcessing.pageDescription")}
        </p>
      </div>

      <AiRewriteMasterToggle />

      {!enabled && (
        <p className="text-sm text-text-3 px-1">
          {t("settings.postProcessing.master.offNote")}
        </p>
      )}

      {enabled && (
        <div className="space-y-3">
          <SettingsSection
            sectionNumber={1}
            title={t("settings.postProcessing.section.baseline")}
            summaryChip={transcribeBinding || undefined}
          >
            <BaselineSection />
          </SettingsSection>
          <SettingsSection
            sectionNumber={2}
            title={t("settings.postProcessing.section.library")}
            summaryChip={
              armedPrompt
                ? `${t("settings.postProcessing.library.armed")}: ${armedPrompt.name}`
                : undefined
            }
            hotkeyChip={promptBinding || undefined}
          >
            <LibrarySection />
          </SettingsSection>
          <SettingsSection
            sectionNumber={3}
            title={t("settings.postProcessing.section.engine")}
            summaryChip={providerLabel}
          >
            <EngineSection />
          </SettingsSection>
        </div>
      )}
    </div>
  );
};
