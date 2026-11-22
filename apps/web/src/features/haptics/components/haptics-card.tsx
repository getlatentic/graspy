import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { useI18n } from "@/lib/i18n-context";
import { useHapticSettings } from "../hooks/use-haptic-settings";
import { useHapticsSupported } from "../hooks/use-haptics-supported";

/**
 * The switches for what a phone or controller can feel (shown only where one
 * could) and for the sounds, which any device with speakers can make.
 */
export function HapticsCard() {
  const { t } = useI18n();
  const { settings, change } = useHapticSettings();
  const vibrates = useHapticsSupported("touch");
  const sounds = useHapticsSupported("sound");
  if (!vibrates && !sounds) return null;
  return (
    <Card className="flex flex-col gap-4">
      {vibrates && (
        <Switch
          label={t("you.vibration")}
          checked={settings.vibration}
          onChange={(vibration) => change({ vibration })}
        />
      )}
      {sounds && (
        <Switch
          label={t("you.sounds")}
          checked={settings.sound}
          onChange={(sound) => change({ sound })}
        />
      )}
    </Card>
  );
}
