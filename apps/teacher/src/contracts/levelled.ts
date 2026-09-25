import { ANYTHING, type Field, type PayloadFields } from "./payloadFields";

/**
 * The two halves reduced to what they can actually disagree about.
 *
 * Two differences are not disagreements. A payload one half leaves unshaped
 * promises nothing about what is inside it, so only its arrival is compared.
 * And one half may name the values a field takes while the other names only its
 * type — the narrower half is not disagreeing, it is promising more.
 */
export function levelled(sent: PayloadFields, read: PayloadFields): [PayloadFields, PayloadFields] {
  const unshaped = Object.keys({ ...sent, ...read }).filter(
    (path) => sent[path]?.holds === ANYTHING || read[path]?.holds === ANYTHING,
  );

  const level = (fields: PayloadFields, against: PayloadFields): PayloadFields =>
    Object.fromEntries(
      Object.entries(fields)
        .filter(([path]) => !unshaped.some((outer) => isInside(path, outer)))
        .map(([path, field]) => [path, agreeable(field, against[path], unshaped.includes(path))]),
    );

  return [level(sent, read), level(read, sent)];
}

function agreeable(field: Field, against: Field | undefined, unshaped: boolean): Field {
  if (unshaped) return { sent: field.sent, orNull: field.orNull, holds: ANYTHING };
  if (field.values && !against?.values) {
    return { sent: field.sent, orNull: field.orNull, holds: field.holds };
  }
  return field;
}

function isInside(path: string, outer: string): boolean {
  return path.startsWith(`${outer}.`) || path.startsWith(`${outer}[`);
}
