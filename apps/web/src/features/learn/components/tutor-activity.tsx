import { TUTOR_TOOLS } from "@/lib/a2a/reply-data";
import { useI18n } from "@/lib/i18n-context";
import { RECONNECTING } from "@/features/learn/lib/chat-view-state";

const NAMED_TOOLS = new Set<string>(TUTOR_TOOLS);

/** What the tutor is doing while the learner waits: a tool by name, or that the connection to the
 * turn is down and being opened again. */
export function TutorActivity({ tool }: { tool: string | null }) {
  const { t } = useI18n();
  return (
    <div className="motion-safe:animate-enter">
      <p role="status" className="animate-pulse text-sm text-muted">
        {tool === RECONNECTING
          ? t("chat.reconnecting")
          : tool && NAMED_TOOLS.has(tool)
            ? t(`chat.activity.${tool}`)
            : t("chat.tutorThinking")}
      </p>
    </div>
  );
}
