import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronDown, ChevronUp, RefreshCcw } from "lucide-react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { Alert } from "../../ui/Alert";
import { SettingContainer } from "../../ui/SettingContainer";
import { ResetButton } from "../../ui/ResetButton";
import { ProviderSelect } from "../PostProcessingSettingsApi/ProviderSelect";
import { ApiKeyField } from "../PostProcessingSettingsApi/ApiKeyField";
import { BaseUrlField } from "../PostProcessingSettingsApi/BaseUrlField";
import { ModelSelect } from "../PostProcessingSettingsApi/ModelSelect";
import { usePostProcessProviderState } from "../PostProcessingSettingsApi/usePostProcessProviderState";
import { FullyLocalBanner } from "./FullyLocalBanner";
import { OnDeviceModelCard } from "./OnDeviceModelCard";
import { ClaudeCodeCard } from "./ClaudeCodeCard";

export const EngineSection: React.FC = () => {
  const { t } = useTranslation();
  const state = usePostProcessProviderState();
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const showNeedsKey = state.isCloudProvider && state.apiKey.trim() === "";

  return (
    <div className="space-y-3">
      <SettingContainer
        title={t("settings.postProcessing.api.provider.title")}
        description={t("settings.postProcessing.api.provider.description")}
        descriptionMode="tooltip"
        layout="horizontal"
        grouped={true}
      >
        <div className="flex items-center gap-2">
          <ProviderSelect
            options={state.providerOptions}
            value={state.selectedProviderId}
            onChange={state.handleProviderSelect}
          />
        </div>
      </SettingContainer>

      {state.selectedProviderId === "on_device" && (
        <>
          <FullyLocalBanner />
          <OnDeviceModelCard />
        </>
      )}
      {state.selectedProviderId === "claude_code" && <ClaudeCodeCard />}
      {state.isAppleProvider &&
        (state.appleIntelligenceUnavailable ? (
          <Alert variant="error" contained>
            {t("settings.postProcessing.api.appleIntelligence.unavailable")}
          </Alert>
        ) : null)}

      {state.isCloudProvider && (
        <>
          {state.selectedProviderId === "gemini" && (
            <Alert variant="info" contained>
              {t("settings.postProcessing.api.freeCloud.note")}{" "}
              <button
                type="button"
                onClick={() => openUrl("https://aistudio.google.com/apikey")}
                className="underline"
              >
                {t("settings.postProcessing.api.freeCloud.getKey")}
              </button>
            </Alert>
          )}
          {showNeedsKey && (
            <Alert variant="warning" contained>
              {t("settings.postProcessing.engine.needsApiKey")}
            </Alert>
          )}

          <SettingContainer
            title={t("settings.postProcessing.api.apiKey.title")}
            description={t("settings.postProcessing.api.apiKey.description")}
            descriptionMode="tooltip"
            layout="horizontal"
            grouped={true}
          >
            <div className="flex items-center gap-2">
              <ApiKeyField
                value={state.apiKey}
                onBlur={state.handleApiKeyChange}
                placeholder={t("settings.postProcessing.api.apiKey.placeholder")}
                disabled={state.isApiKeyUpdating}
                className="min-w-[320px]"
              />
            </div>
          </SettingContainer>

          <button
            type="button"
            className="flex items-center gap-1.5 text-sm text-text-3 hover:text-text-2 transition-colors"
            onClick={() => setAdvancedOpen((p) => !p)}
          >
            {advancedOpen ? (
              <ChevronUp className="w-3.5 h-3.5" />
            ) : (
              <ChevronDown className="w-3.5 h-3.5" />
            )}
            {t("settings.postProcessing.engine.advanced")}
          </button>
          {advancedOpen && (
            <div className="space-y-2 pl-1">
              {state.isCustomProvider && (
                <SettingContainer
                  title={t("settings.postProcessing.api.baseUrl.title")}
                  description={t(
                    "settings.postProcessing.api.baseUrl.description",
                  )}
                  descriptionMode="tooltip"
                  layout="horizontal"
                  grouped={true}
                >
                  <div className="flex items-center gap-2">
                    <BaseUrlField
                      value={state.baseUrl}
                      onBlur={state.handleBaseUrlChange}
                      placeholder={t(
                        "settings.postProcessing.api.baseUrl.placeholder",
                      )}
                      disabled={state.isBaseUrlUpdating}
                      className="min-w-[380px]"
                    />
                  </div>
                </SettingContainer>
              )}
              <SettingContainer
                title={t("settings.postProcessing.api.model.title")}
                description={
                  state.isCustomProvider
                    ? t("settings.postProcessing.api.model.descriptionCustom")
                    : t("settings.postProcessing.api.model.descriptionDefault")
                }
                descriptionMode="tooltip"
                layout="stacked"
                grouped={true}
              >
                <div className="flex items-center gap-2">
                  <ModelSelect
                    value={state.model}
                    options={state.modelOptions}
                    disabled={state.isModelUpdating}
                    isLoading={state.isFetchingModels}
                    placeholder={
                      state.modelOptions.length > 0
                        ? t(
                            "settings.postProcessing.api.model.placeholderWithOptions",
                          )
                        : t(
                            "settings.postProcessing.api.model.placeholderNoOptions",
                          )
                    }
                    onSelect={state.handleModelSelect}
                    onCreate={state.handleModelCreate}
                    onBlur={() => {}}
                    className="flex-1 min-w-[380px]"
                  />
                  <ResetButton
                    onClick={state.handleRefreshModels}
                    disabled={state.isFetchingModels}
                    ariaLabel={t(
                      "settings.postProcessing.api.model.refreshModels",
                    )}
                    className="flex h-10 w-10 items-center justify-center"
                  >
                    <RefreshCcw
                      className={`h-4 w-4 ${state.isFetchingModels ? "animate-spin" : ""}`}
                    />
                  </ResetButton>
                </div>
              </SettingContainer>
            </div>
          )}
        </>
      )}
    </div>
  );
};
