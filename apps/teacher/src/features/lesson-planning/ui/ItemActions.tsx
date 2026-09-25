import { Button } from "@carbon/react";

/**
 * Move up, move down, remove — the controls beside anything a teacher can
 * reorder or delete: a learning goal, a check, a piece of a lesson step.
 *
 * Which of the three are available is the caller's to say, because only the
 * caller knows what the item sits among.
 */
export function ItemActions({
  label,
  canMoveUp,
  canMoveDown,
  canRemove,
  onMoveUp,
  onMoveDown,
  onRemove,
}: {
  readonly label: string;
  readonly canMoveUp: boolean;
  readonly canMoveDown: boolean;
  readonly canRemove: boolean;
  readonly onMoveUp: () => void;
  readonly onMoveDown: () => void;
  readonly onRemove: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-end gap-xs">
      <Button
        type="button"
        kind="ghost"
        size="sm"
        disabled={!canMoveUp}
        aria-label={`Move ${label} up`}
        onClick={onMoveUp}
      >
        Move up
      </Button>
      <Button
        type="button"
        kind="ghost"
        size="sm"
        disabled={!canMoveDown}
        aria-label={`Move ${label} down`}
        onClick={onMoveDown}
      >
        Move down
      </Button>
      <Button
        type="button"
        kind="danger--ghost"
        size="sm"
        disabled={!canRemove}
        aria-label={`Remove ${label}`}
        onClick={onRemove}
      >
        Remove
      </Button>
    </div>
  );
}
