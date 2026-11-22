import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { useI18n } from "@/lib/i18n-context";
import { useHapticSettings } from "../hooks/use-haptic-settings";
import { useHapticsSupported } from "../hooks/use-haptics-supported";

/** The vibration switch, shown only where a phone or controller could feel it. */
export function HapticsCard() {
  const { t } = useI18n();
  const { settings, change } = useHapticSettings();
  if (!useHapticsSupported()) return null;
  return (
    <Card>
      <Switch
        label={t("you.vibration")}
        checked={settings.enabled}
        onChange={(enabled) => change({ enabled })}
      />
    </Card>
  );
}
