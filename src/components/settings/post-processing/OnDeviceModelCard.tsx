import React, { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { listen } from "@tauri-apps/api/event";
import {
  CheckCircle2,
  Download,
  HardDriveDownload,
  Loader2,
} from "lucide-react";
import { commands } from "@/bindings";
import { Button } from "../../ui/Button";
import { useSettings } from "../../../hooks/useSettings";

/// Id of the in-process on-device refinement provider (mirrors the Rust
/// `ON_DEVICE_PROVIDER_ID`). When this provider is active and the model is not
/// yet downloaded, the AI Rewrite page surfaces an in-app download control.
const ON_DEVICE_PROVIDER_ID = "on_device";

// Default on-device model filename (mirrors the Rust `DEFAULT_MODEL_FILENAME`).
// TODO(C2): replace this single-model card with the catalog-driven picker.
const DEFAULT_MODEL_FILENAME = "gemma-2-2b-it-Q4_K_M.gguf";

// In-app download card for the in-process on-device refinement model. Shown
// only when the on-device provider is the active refinement provider. Reflects
// three states: missing (offers a download), downloading (live progress from
// the `on-device-model-download-progress` event), and ready.
export const OnDeviceModelCard: React.FC = () => {
  const { t } = useTranslation();
  const { settings } = useSettings();
  const [available, setAvailable] = useState<boolean | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [percent, setPercent] = useState(0);
  const [error, setError] = useState(false);

  const activeProviderId =
    settings?.post_process_provider_id ?? ON_DEVICE_PROVIDER_ID;
  const isActive = activeProviderId === ON_DEVICE_PROVIDER_ID;

  const refreshAvailability = useCallback(async () => {
    try {
      const ready = await commands.isOnDeviceModelAvailable(
        DEFAULT_MODEL_FILENAME,
      );
      setAvailable(ready);
    } catch {
      setAvailable(false);
    }
  }, []);

  useEffect(() => {
    if (!isActive) return;
    void refreshAvailability();
  }, [isActive, refreshAvailability]);

  // The backend streams a float percentage on `on-device-model-download-progress`.
  useEffect(() => {
    if (!isActive) return;
    const unlisten = listen<number>(
      "on-device-model-download-progress",
      (event) => {
        setPercent(Math.min(100, Math.max(0, Math.round(event.payload))));
      },
    );
    return () => {
      void unlisten.then((fn) => fn());
    };
  }, [isActive]);

  const handleDownload = useCallback(async () => {
    setError(false);
    setDownloading(true);
    setPercent(0);
    try {
      const result = await commands.downloadOnDeviceModel(
        DEFAULT_MODEL_FILENAME,
      );
      if (result.status === "ok") {
        await refreshAvailability();
      } else {
        setError(true);
      }
    } catch {
      setError(true);
    } finally {
      setDownloading(false);
    }
  }, [refreshAvailability]);

  // Only relevant when the on-device engine is the active provider.
  if (!isActive) return null;

  return (
    <div className="flex items-center gap-4 px-4 py-3.5 rounded-xl border border-line bg-surface-2/60">
      <span
        className={`shrink-0 ${available ? "text-accent" : "text-text-2"}`}
      >
        {available ? (
          <CheckCircle2 className="w-5 h-5" />
        ) : (
          <HardDriveDownload className="w-5 h-5" />
        )}
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-text">
          {t("settings.postProcessing.onDevice.title")}
        </p>
        <p className="text-xs text-text-3 mt-0.5 leading-relaxed">
          {available
            ? t("settings.postProcessing.onDevice.descriptionReady")
            : t("settings.postProcessing.onDevice.descriptionMissing")}
        </p>
        {downloading && (
          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-surface-3">
            <div
              className="h-full rounded-full bg-accent transition-[width] duration-200 ease-out"
              style={{ width: `${percent}%` }}
            />
          </div>
        )}
        {error && (
          <p className="text-xs text-red-400 mt-1.5">
            {t("settings.postProcessing.onDevice.error")}
          </p>
        )}
      </div>
      <div className="shrink-0">
        {available ? (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-accent/35 px-2.5 py-1 text-[11px] font-semibold text-accent">
            <CheckCircle2 className="w-3.5 h-3.5" />
            {t("settings.postProcessing.onDevice.ready")}
          </span>
        ) : downloading ? (
          <span className="inline-flex items-center gap-2 text-xs text-text-2">
            <Loader2 className="w-4 h-4 animate-spin" />
            {t("settings.postProcessing.onDevice.downloading", { percent })}
          </span>
        ) : (
          <Button
            onClick={handleDownload}
            variant="primary"
            size="md"
            className="inline-flex items-center gap-2 whitespace-nowrap"
          >
            <Download className="w-4 h-4" />
            {t("settings.postProcessing.onDevice.download")}
          </Button>
        )}
      </div>
    </div>
  );
};
