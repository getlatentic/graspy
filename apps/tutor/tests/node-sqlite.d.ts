// Node's own SQLite, which the tests run the instance's SQL on; @types/node here predates it.
declare module "node:sqlite" {
  export class DatabaseSync {
    constructor(path: string);
    prepare(sql: string): { all(...values: (string | number | boolean | null)[]): Record<string, unknown>[] };
  }
}
