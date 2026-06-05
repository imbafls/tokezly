import React, { useState } from "react";
import { Trans, useTranslation } from "react-i18next";
import { ChevronDown, ChevronUp, Trash2 } from "lucide-react";
import { commands } from "@/bindings";
import { Dropdown, Textarea } from "@/components/ui";
import { Button } from "../../ui/Button";
import { Input } from "../../ui/Input";
import { ShortcutInput } from "../ShortcutInput";
import { useSettings } from "../../../hooks/useSettings";

const CLEAN_PROMPT_ID = "default_improve_transcriptions";

export const LibrarySection: React.FC = () => {
  const { t } = useTranslation();
  const { getSetting, updateSetting, isUpdating, refreshSettings } =
    useSettings();

  const allPrompts = getSetting("post_process_prompts") || [];
  const libraryPrompts = allPrompts.filter((p) => p.id !== CLEAN_PROMPT_ID);
  const selectedPromptId = getSetting("post_process_selected_prompt_id") || "";
  const armedId = selectedPromptId === CLEAN_PROMPT_ID ? "" : selectedPromptId;

  const [manageOpen, setManageOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [draftName, setDraftName] = useState("");
  const [draftText, setDraftText] = useState("");

  const armedOptions = libraryPrompts.map((p) => ({
    value: p.id,
    label: p.name,
  }));
  const armPrompt = (id: string | null) => {
    if (id) void updateSetting("post_process_selected_prompt_id", id);
  };
  const deletePrompt = async (id: string) => {
    try {
      await commands.deletePostProcessPrompt(id);
      await refreshSettings();
    } catch (e) {
      console.error(e);
    }
  };
  const createPrompt = async () => {
    if (!draftName.trim() || !draftText.trim()) return;
    try {
      const r = await commands.addPostProcessPrompt(
        draftName.trim(),
        draftText.trim(),
      );
      if (r.status === "ok") {
        await refreshSettings();
        void updateSetting("post_process_selected_prompt_id", r.data.id);
        setIsCreating(false);
        setDraftName("");
        setDraftText("");
      }
    } catch (e) {
      console.error(e);
    }
  };
  const selUpdating = isUpdating("post_process_selected_prompt_id");

  return (
    <div className="space-y-4">
      <p className="text-sm text-text-2 leading-relaxed">
        {t("settings.postProcessing.library.description")}
      </p>
      <div className="flex items-center gap-3">
        <span className="text-sm font-medium text-text shrink-0">
          {t("settings.postProcessing.library.armed")}
        </span>
        <Dropdown
          selectedValue={armedId || null}
          options={armedOptions}
          onSelect={armPrompt}
          placeholder={t("settings.postProcessing.library.noPromptArmed")}
          disabled={selUpdating || libraryPrompts.length === 0}
          className="min-w-[200px]"
        />
      </div>
      <div className="space-y-1">
        <p className="text-xs text-text-3 font-medium uppercase tracking-wide">
          {t("settings.postProcessing.library.hotkeyLabel")}
        </p>
        <ShortcutInput
          shortcutId="transcribe_with_post_process"
          descriptionMode="tooltip"
          grouped={false}
        />
      </div>
      <button
        type="button"
        className="flex items-center gap-1.5 text-sm text-accent hover:text-accent/80 transition-colors"
        onClick={() => setManageOpen((p) => !p)}
      >
        {manageOpen ? (
          <ChevronUp className="w-3.5 h-3.5" />
        ) : (
          <ChevronDown className="w-3.5 h-3.5" />
        )}
        {t("settings.postProcessing.library.managePrompts", {
          count: libraryPrompts.length,
        })}
      </button>
      {manageOpen && (
        <div className="space-y-2">
          {libraryPrompts.length === 0 && !isCreating && (
            <p className="text-sm text-text-3 py-2">
              {t("settings.postProcessing.library.noPrompts")}
            </p>
          )}
          {libraryPrompts.map((prompt) => {
            const isArmed = prompt.id === armedId;
            const isBuiltin = prompt.builtin === true;
            return (
              <div
                key={prompt.id}
                className="flex items-center gap-2 px-3 py-2 rounded-lg border border-mid-gray/20 bg-surface-2/40"
              >
                <span className="flex-1 min-w-0 text-sm text-text truncate">
                  {prompt.name}
                </span>
                {isBuiltin && (
                  <span className="shrink-0 rounded-full border border-mid-gray/40 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-text-3">
                    {t("settings.postProcessing.library.builtinBadge")}
                  </span>
                )}
                {isArmed && (
                  <span className="shrink-0 rounded-full border border-accent/40 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-accent">
                    {t("settings.postProcessing.library.armedBadge")}
                  </span>
                )}
                {!isArmed && (
                  <button
                    type="button"
                    className="shrink-0 text-xs text-text-3 hover:text-accent transition-colors"
                    onClick={() => armPrompt(prompt.id)}
                  >
                    {t("settings.postProcessing.library.setAsArmed")}
                  </button>
                )}
                {!isBuiltin && (
                  <button
                    type="button"
                    className="shrink-0 text-text-3 hover:text-red-400 transition-colors"
                    onClick={() => void deletePrompt(prompt.id)}
                    aria-label={t("settings.postProcessing.library.deletePrompt")}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            );
          })}
          {!isCreating ? (
            <Button
              onClick={() => setIsCreating(true)}
              variant="secondary"
              size="md"
            >
              {t("settings.postProcessing.library.createNew")}
            </Button>
          ) : (
            <div className="space-y-3 pt-2">
              <div className="space-y-1.5 flex flex-col">
                <label className="text-sm font-semibold">
                  {t("settings.postProcessing.prompts.promptLabel")}
                </label>
                <Input
                  type="text"
                  value={draftName}
                  onChange={(e) => setDraftName(e.target.value)}
                  placeholder={t(
                    "settings.postProcessing.prompts.promptLabelPlaceholder",
                  )}
                  variant="compact"
                />
              </div>
              <div className="space-y-1.5 flex flex-col">
                <label className="text-sm font-semibold">
                  {t("settings.postProcessing.prompts.promptInstructions")}
                </label>
                <Textarea
                  value={draftText}
                  onChange={(e) => setDraftText(e.target.value)}
                  placeholder={t(
                    "settings.postProcessing.prompts.promptInstructionsPlaceholder",
                  )}
                />
                <p className="text-xs text-mid-gray/70">
                  <Trans
                    i18nKey="settings.postProcessing.prompts.promptTip"
                    components={{ code: <code /> }}
                  />
                </p>
              </div>
              <div className="flex gap-2">
                <Button
                  onClick={createPrompt}
                  variant="primary"
                  size="md"
                  disabled={!draftName.trim() || !draftText.trim()}
                >
                  {t("settings.postProcessing.prompts.createPrompt")}
                </Button>
                <Button
                  onClick={() => {
                    setIsCreating(false);
                    setDraftName("");
                    setDraftText("");
                  }}
                  variant="secondary"
                  size="md"
                >
                  {t("settings.postProcessing.prompts.cancel")}
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
