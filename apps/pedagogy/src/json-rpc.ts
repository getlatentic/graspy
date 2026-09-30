import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createInterface } from "node:readline";

type Pending = { resolve: (value: unknown) => void; reject: (error: Error) => void };

/** JSON-RPC 2.0 over a child process's stdio, one JSON object per line. */
export class JsonRpcProcess {
  private readonly process: ChildProcessWithoutNullStreams;
  private readonly pending = new Map<number, Pending>();
  private nextId = 1;

  constructor(command: string, args: string[], options: { env?: NodeJS.ProcessEnv; cwd?: string } = {}) {
    this.process = spawn(command, args, { ...options, stdio: ["pipe", "pipe", "pipe"] });
    createInterface({ input: this.process.stdout }).on("line", (line) => this.read(line));
    this.process.on("exit", (code) => this.failAll(new Error(`The engine exited with code ${code}`)));
  }

  call<T>(method: string, params: object = {}): Promise<T> {
    const id = this.nextId++;
    const done = new Promise<T>((resolve, reject) =>
      this.pending.set(id, { resolve: resolve as (value: unknown) => void, reject }),
    );
    this.process.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`);
    return done;
  }

  close(): void {
    this.process.kill();
  }

  private read(line: string): void {
    let message: { id?: number; result?: unknown; error?: { message: string } };
    try {
      message = JSON.parse(line);
    } catch {
      return;
    }
    const waiting = message.id === undefined ? undefined : this.pending.get(message.id);
    if (!waiting) return;
    this.pending.delete(message.id as number);
    if (message.error) waiting.reject(new Error(message.error.message));
    else waiting.resolve(message.result);
  }

  private failAll(error: Error): void {
    for (const waiting of this.pending.values()) waiting.reject(error);
    this.pending.clear();
  }
}
