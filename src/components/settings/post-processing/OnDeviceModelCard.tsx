import React, { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { listen } from "@tauri-apps/api/event";
import {
  CheckCircle2,
  Download,
  HardDriveDownload,
  Loader2,
} from "lucide-react";
import { commands, type OnDeviceModelInfo } from "@/bindings";
import { Button } from "../../ui/Button";
import { useSettings } from "../../../hooks/useSettings";

/// Id of the in-process on-device refinement provider (mirrors the Rust
/// `ON_DEVICE_PROVIDER_ID`). The selected on-device model filename rides in
/// `post_process_models["on_device"]`.
const ON_DEVICE_PROVIDER_ID = "on_device";

// Catalog-driven picker for the in-process on-device refinement model. Shown
// only when the on-device provider is the active refinement provider. Lists the
// curated models (display name, tier, size) and lets the user download and
// select which one runs rewrites. Downloads are kept; switching is instant once
// downloaded. Live progress comes from the `on-device-model-download-progress`
// event.
export const OnDeviceModelCard: React.FC = () => {
  const { t } = useTranslation();
  const { settings, updatePostProcessModel } = useSettings();
  const [catalog, setCatalog] = useState<OnDeviceModelInfo[]>([]);
  const [available, setAvailable] = useState<Record<string, boolean>>({});
  const [downloading, setDownloading] = useState<string | null>(null);
  const [percent, setPercent] = useState(0);
  const [errored, setErrored] = useState<string | null>(null);

  const isActive =
    (settings?.post_process_provider_id ?? ON_DEVICE_PROVIDER_ID) ===
    ON_DEVICE_PROVIDER_ID;
  const selected = settings?.post_process_models?.[ON_DEVICE_PROVIDER_ID] ?? "";

  const refreshAvailability = useCallback(
    async (models: OnDeviceModelInfo[]) => {
      const entries = await Promise.all(
        models.map(
          async (m) =>
            [m.filename, await commands.isOnDeviceModelAvailable(m.filename)] as const,
        ),
      );
      setAvailable(Object.fromEntries(entries));
    },
    [],
  );

  useEffect(() => {
    if (!isActive) return;
    let cancelled = false;
    void (async () => {
      try {
        const models = await commands.getOnDeviceModelCatalog();
        if (cancelled) return;
        setCatalog(models);
        await refreshAvailability(models);
      } catch (e) {
        console.error("Failed to load on-device model catalog:", e);
      }
    })();
    return () => {
      cancelled = true;
    };
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

  const handleDownload = useCallback(
    async (filename: string) => {
      setErrored(null);
      setDownloading(filename);
      setPercent(0);
      try {
        const result = await commands.downloadOnDeviceModel(filename);
        if (result.status === "ok") {
          await refreshAvailability(catalog);
          // Make the freshly-downloaded model the active on-device model.
          void updatePostProcessModel(ON_DEVICE_PROVIDER_ID, filename);
        } else {
          setErrored(filename);
        }
      } catch {
        setErrored(filename);
      } finally {
        setDownloading(null);
      }
    },
    [catalog, refreshAvailability, updatePostProcessModel],
  );

  const handleSelect = useCallback(
    (filename: string) => {
      void updatePostProcessModel(ON_DEVICE_PROVIDER_ID, filename);
    },
    [updatePostProcessModel],
  );

  // Only relevant when the on-device engine is the active provider.
  if (!isActive) return null;

  return (
    <div className="rounded-xl border border-line bg-surface-2/60 p-3 space-y-2">
      <p className="text-sm font-semibold text-text">
        {t("settings.postProcessing.onDevice.pickerTitle")}
      </p>
      <p className="text-xs text-text-3">
        {t("settings.postProcessing.onDevice.pickerDescription")}
      </p>
      {catalog.map((m) => {
        const ready = available[m.filename] === true;
        const isSelected = selected === m.filename;
        const isDownloading = downloading === m.filename;
        return (
          <div
            key={m.filename}
            className={`flex items-center gap-3 rounded-lg border px-3 py-2 ${
              isSelected ? "border-accent/50 bg-accent/[0.06]" : "border-line"
            }`}
          >
            <span className={`shrink-0 ${ready ? "text-accent" : "text-text-2"}`}>
              {ready ? (
                <CheckCircle2 className="w-4 h-4" />
              ) : (
                <HardDriveDownload className="w-4 h-4" />
              )}
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-sm text-text">{m.display_name}</p>
              <p className="text-[11px] text-text-3">
                {t(`settings.postProcessing.onDevice.tier.${m.tier}`)} ·{" "}
                {(m.approx_size_mb / 1024).toFixed(1)} GB
              </p>
              {isDownloading && (
                <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-surface-3">
                  <div
                    className="h-full rounded-full bg-accent transition-[width] duration-200"
                    style={{ width: `${percent}%` }}
                  />
                </div>
              )}
              {errored === m.filename && (
                <p className="text-[11px] text-red-400 mt-1">
                  {t("settings.postProcessing.onDevice.error")}
                </p>
              )}
            </div>
            <div className="shrink-0">
              {!ready ? (
                isDownloading ? (
                  <span className="inline-flex items-center gap-1.5 text-xs text-text-2">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    {t("settings.postProcessing.onDevice.downloading", {
                      percent,
                    })}
                  </span>
                ) : (
                  <Button
                    onClick={() => void handleDownload(m.filename)}
                    variant="secondary"
                    size="md"
                    className="inline-flex items-center gap-1.5"
                  >
                    <Download className="w-3.5 h-3.5" />
                    {t("settings.postProcessing.onDevice.downloadShort")}
                  </Button>
                )
              ) : isSelected ? (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-accent/35 px-2 py-0.5 text-[11px] font-semibold text-accent">
                  {t("settings.postProcessing.onDevice.active")}
                </span>
              ) : (
                <Button
                  onClick={() => handleSelect(m.filename)}
                  variant="secondary"
                  size="md"
                >
                  {t("settings.postProcessing.onDevice.select")}
                </Button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};
