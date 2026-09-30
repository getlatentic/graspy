// The real lesson plans are read from disk by tests/real-lists.test.ts; the Worker's types do not know Node's.
declare module "node:fs" {
  export function readdirSync(path: string): string[];
  export function readFileSync(path: string, encoding: "utf8"): string;
  export function statSync(path: string): { isDirectory(): boolean };
}
declare module "node:path" {
  export function join(...parts: string[]): string;
}
interface ImportMeta {
  url: string;
}
