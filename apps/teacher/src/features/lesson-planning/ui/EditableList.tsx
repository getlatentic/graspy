import type { ReactNode } from "react";

import type { LessonContent } from "../domain/lessonContent";
import type { MoveDirection } from "../domain/lessonContentEditing";
import { addButton, sectionLabel } from "./editableChrome";
import { ItemControls } from "./ItemControls";

/**
 * A part of a lesson made of items a teacher writes, reorders and removes.
 *
 * The goals, the instructional materials and the checks are all this: a heading, an ordered
 * list where each row carries its own controls, and a button to add another.
 * What differs is only what a row is made of — one line for a goal, a question
 * and its answer for a check — so the row is composed by the caller and the
 * list keeps the part that was three times identical.
 */
export function EditableList<Item>({
  section,
  items,
  edit,
  onChange,
  keyOf,
  children,
}: {
  readonly section: {
    readonly id: string;
    readonly heading: string;
    /** What one row is, as a control names the row it acts on: "learning goal". */
    readonly noun: string;
    readonly addLabel: string;
    /** Rows carrying more than one field stand further apart. */
    readonly spacing?: "sm" | "md";
  };
  readonly items: readonly Item[];
  /** The three ways the list itself changes, each returning the lesson it makes. */
  readonly edit: {
    readonly move: (index: number, direction: MoveDirection) => LessonContent;
    readonly remove: (index: number) => LessonContent;
    readonly add: () => LessonContent;
  };
  readonly onChange: (content: LessonContent) => void;
  /**
   * What identifies a row, when a row has an identity of its own.
   *
   * Rows that carry one are keyed by it, so reordering moves the row rather
   * than rewriting every row after it — which is what an index key does, and
   * what loses a cursor mid-edit.
   */
  readonly keyOf?: (item: Item, index: number) => string;
  /** One row's own fields. */
  readonly children: (item: Item, index: number) => ReactNode;
}) {
  return (
    <section className="grid gap-md" aria-labelledby={section.id}>
      <h3 className={sectionLabel} id={section.id}>
        {section.heading}
      </h3>
      <ol className={`grid m-0 p-0 list-none ${section.spacing === "md" ? "gap-md" : "gap-sm"}`}>
        {items.map((item, index) => (
          <li className="flex items-start gap-sm" key={keyOf ? keyOf(item, index) : index}>
            {children(item, index)}
            <ItemControls
              label={`${section.noun} ${index + 1}`}
              index={index}
              count={items.length}
              onMove={(direction) => onChange(edit.move(index, direction))}
              onRemove={() => onChange(edit.remove(index))}
            />
          </li>
        ))}
      </ol>
      <button type="button" className={addButton} onClick={() => onChange(edit.add())}>
        {section.addLabel}
      </button>
    </section>
  );
}
