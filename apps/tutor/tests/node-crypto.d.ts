// The bench's split rule hashes a case id with SHA-256; the Worker's types do not know Node's.
declare module "node:crypto" {
  export function createHash(algorithm: "sha256"): { update(data: string): { digest(encoding: "hex"): string } };
}
