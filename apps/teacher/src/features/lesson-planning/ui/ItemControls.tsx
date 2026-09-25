import type { MoveDirection } from "../domain/lessonContentEditing";
import { iconButton } from "./editableChrome";

export function ItemControls({
  label,
  index,
  count,
  onMove,
  onRemove,
}: {
  readonly label: string;
  readonly index: number;
  readonly count: number;
  readonly onMove: (direction: MoveDirection) => void;
  readonly onRemove: () => void;
}) {
  return (
    <div className="flex items-center gap-2xs flex-none">
      <button
        type="button"
        className={iconButton}
        aria-label={`Move ${label} up`}
        disabled={index === 0}
        onClick={() => onMove("up")}
      >
        ↑
      </button>
      <button
        type="button"
        className={iconButton}
        aria-label={`Move ${label} down`}
        disabled={index === count - 1}
        onClick={() => onMove("down")}
      >
        ↓
      </button>
      <button type="button" className={iconButton} aria-label={`Remove ${label}`} onClick={onRemove}>
        ✕
      </button>
    </div>
  );
}
