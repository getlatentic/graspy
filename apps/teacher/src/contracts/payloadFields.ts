type Schema = Record<string, unknown>;

export type Definitions = Readonly<Record<string, unknown>>;

/** What one field of a payload carries. */
export interface Field {
  /** Whether every answer carries it. A field that may be null is one of them. */
  readonly sent: boolean;
  readonly orNull: boolean;
  readonly holds: string;
  /** The few values it admits, when it admits only a few. */
  readonly values?: readonly string[];
}

export type PayloadFields = Readonly<Record<string, Field>>;

export const ANYTHING = "anything";

/**
 * Every field a payload carries, by the path a reader takes to it.
 *
 * Both halves describe their payloads as JSON Schema and disagree on how to
 * write it — schemars says a nullable string is `type: ["string", "null"]` and
 * zod says `anyOf: [string, null]`, and a documented enum is a branch per value
 * on one side and one enum on the other. Each is read the same way here so the
 * two can be compared whole.
 */
export function payloadFields(schema: unknown, definitions: Definitions): PayloadFields {
  const fields: Record<string, Field> = {};

  const read = (node: unknown, path: string, required: boolean) => {
    const found = resolve(node, definitions);
    const { within, ...carries } = describe(found.schema, path);
    // Nothing in the backend leaves a key out: an optional field arrives as null.
    fields[path] = { sent: required || found.orNull, orNull: found.orNull, ...carries };
    for (const field of within) read(field.schema, field.path, field.required);
  };

  read(schema, "the answer", true);
  return fields;
}

/**
 * A schema with its references followed and its "or null" taken off.
 *
 * Following more references than there are types to follow means one of them
 * leads back to itself, which no payload can be.
 */
function resolve(node: unknown, definitions: Definitions): { schema: Schema; orNull: boolean } {
  let { schema, orNull } = withoutNull(node);
  let named = referenceIn(schema);

  for (let followed = 0; named !== null; followed += 1) {
    if (followed > Object.keys(definitions).length) {
      throw new Error(`${named} refers back into itself`);
    }
    const target = withoutNull(definitions[named]);
    schema = target.schema;
    orNull = orNull || target.orNull;
    named = referenceIn(schema);
  }
  return { schema, orNull };
}

interface Within {
  readonly path: string;
  readonly schema: unknown;
  readonly required: boolean;
}

interface Described {
  readonly holds: string;
  readonly values?: readonly string[];
  readonly within: readonly Within[];
}

/** What a value holds, and the fields, items and branches inside it. */
function describe(schema: Schema, path: string): Described {
  if (schema.properties) return { holds: "object", within: propertiesOf(schema, path) };
  if (schema.items) {
    return { holds: "list", within: [{ path: `${path}[]`, schema: schema.items, required: true }] };
  }

  const values = fixedValues(schema);
  if (values) {
    const numbers = values.every((value) => Number.isFinite(Number(value)));
    return { holds: numbers ? "number" : "string", values, within: [] };
  }

  const choices = alternatives(schema);
  if (choices.length > 0) {
    return { holds: `one of ${choices.length}`, within: branchesOf(choices, path) };
  }
  if (schema.type === "integer") return { holds: "number", within: [] };
  return { holds: typeof schema.type === "string" ? schema.type : ANYTHING, within: [] };
}

function propertiesOf(schema: Schema, path: string): Within[] {
  const named = new Set(Array.isArray(schema.required) ? schema.required : []);
  return Object.entries(schema.properties as Schema).map(([name, field]) => ({
    path: `${path}.${name}`,
    schema: field,
    required: named.has(name),
  }));
}

function branchesOf(choices: readonly unknown[], path: string): Within[] {
  return choices.map((choice, index) => ({
    path: `${path}|${index}`,
    schema: choice,
    required: true,
  }));
}

/** A schema with "or null" taken off, however that half wrote it. */
function withoutNull(node: unknown): { schema: Schema; orNull: boolean } {
  const schema = asSchema(node);

  // A schema that constrains nothing admits anything, null among it.
  if (Object.keys(schema).every((key) => key === "description")) {
    return { schema, orNull: true };
  }
  if (Array.isArray(schema.type)) {
    const named = schema.type.filter((one) => one !== "null");
    return { schema: { ...schema, type: named[0] }, orNull: named.length < schema.type.length };
  }

  const choices = alternatives(schema);
  const rest = choices.filter((choice) => asSchema(choice).type !== "null");
  if (rest.length === choices.length) return { schema, orNull: false };
  return { schema: rest.length === 1 ? asSchema(rest[0]) : { ...schema, anyOf: rest }, orNull: true };
}

/** The values a schema admits, when it admits only a fixed few. */
function fixedValues(schema: Schema): string[] | undefined {
  if (Array.isArray(schema.enum)) return schema.enum.map(String).sort();
  if (schema.const !== undefined) return [String(schema.const)];

  const branches = alternatives(schema).map(onlyValueOf);
  if (branches.length === 0 || branches.includes(undefined)) return undefined;
  return branches.map(String).sort();
}

function onlyValueOf(node: unknown): unknown {
  const schema = asSchema(node);
  if (schema.const !== undefined) return schema.const;
  return Array.isArray(schema.enum) && schema.enum.length === 1 ? schema.enum[0] : undefined;
}

function alternatives(schema: Schema): unknown[] {
  const choices = schema.anyOf ?? schema.oneOf;
  return Array.isArray(choices) ? choices : [];
}

function referenceIn(schema: Schema): string | null {
  return typeof schema.$ref === "string" ? (schema.$ref.split("/").pop() ?? null) : null;
}

function asSchema(node: unknown): Schema {
  return typeof node === "object" && node !== null && !Array.isArray(node) ? (node as Schema) : {};
}
