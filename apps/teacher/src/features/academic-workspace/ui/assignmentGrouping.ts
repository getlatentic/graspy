import type { TeachingAssignment } from "../domain/academicWorkspace";
import { splitAssignment } from "./assignmentLabel";

export interface ClassGroup {
  readonly classLabel: string;
  readonly members: readonly {
    readonly assignment: TeachingAssignment;
    readonly subject: string;
  }[];
}

/**
 * Teaching assignments gathered under the class they are taught to.
 *
 * A teacher thinks in classes before subjects — "JSS 2, and what I teach them"
 * rather than a flat list where the same class appears three times — so the
 * class is the heading and the subjects sit beneath it.
 *
 * Classes keep the order they first appear in rather than being sorted, so the
 * list a teacher sees follows the order their assignments were set up in and
 * does not rearrange itself as assignments are added.
 */
export function groupByClass(assignments: readonly TeachingAssignment[]): ClassGroup[] {
  const order: string[] = [];
  const byClass = new Map<string, { assignment: TeachingAssignment; subject: string }[]>();
  for (const assignment of assignments) {
    const { subject, classLabel } = splitAssignment(assignment.displayName);
    let members = byClass.get(classLabel);
    if (!members) {
      members = [];
      byClass.set(classLabel, members);
      order.push(classLabel);
    }
    members.push({ assignment, subject });
  }
  return order.map((classLabel) => ({ classLabel, members: byClass.get(classLabel) ?? [] }));
}
