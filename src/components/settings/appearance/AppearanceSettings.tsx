import React from "react";
import { useTranslation } from "react-i18next";
import { SettingsGroup } from "../../ui/SettingsGroup";
import { ShowOverlay } from "../ShowOverlay";
import { ShowTrayIcon } from "../ShowTrayIcon";

// Appearance groups the user-facing chrome settings (the runtime overlay and the
// system-tray icon) in one place. These previously lived under Advanced.
export const AppearanceSettings: React.FC = () => {
  const { t } = useTranslation();

  return (
    <div className="max-w-3xl w-full mx-auto space-y-6">
      <SettingsGroup title={t("settings.appearance.groups.interface")}>
        <ShowOverlay descriptionMode="tooltip" grouped={true} />
        <ShowTrayIcon descriptionMode="tooltip" grouped={true} />
      </SettingsGroup>
    </div>
  );
};
