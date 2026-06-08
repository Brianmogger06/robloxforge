import express, { type Request, type Response } from "express";
import { randomUUID } from "crypto";

export const PROTOCOL_VERSION = 1;

export interface Command {
  id: string;
  tool: string;
  args: Record<string, unknown>;
  protocolVersion: number;
}

export interface CommandResult {
  id: string;
  ok: boolean;
  data?: unknown;
  error?: string;
}

interface Pending {
  resolve: (r: CommandResult) => void;
  reject: (e: Error) => void;
}

const POLL_TIMEOUT_MS = 30_000;
const COMMAND_TIMEOUT_MS = 60_000;

export class HttpBridge {
  private readonly app = express();
  private readonly queue: Command[] = [];
  private readonly pending = new Map<string, Pending>();
  private pollWaiter: ((cmd: Command) => void) | null = null;

  constructor(private readonly port: number) {
    this.app.use(express.json());
    this.app.get("/poll", (req, res) => this.handlePoll(req, res));
    this.app.post("/result", (req, res) => this.handleResult(req, res));
    this.app.get("/health", (_req, res) => res.json({ ok: true }));
  }

  private handlePoll(_req: Request, res: Response): void {
    if (this.queue.length > 0) {
      res.json(this.queue.shift());
      return;
    }

    const timer = setTimeout(() => {
      this.pollWaiter = null;
      res.status(204).end();
    }, POLL_TIMEOUT_MS);

    this.pollWaiter = (cmd) => {
      clearTimeout(timer);
      this.pollWaiter = null;
      res.json(cmd);
    };
  }

  private handleResult(req: Request, res: Response): void {
    const result = req.body as CommandResult;
    const p = this.pending.get(result.id);
    if (p) {
      this.pending.delete(result.id);
      p.resolve(result);
    }
    res.status(200).end();
  }

  send(tool: string, args: Record<string, unknown>): Promise<CommandResult> {
    const id = randomUUID();
    const cmd: Command = { id, tool, args, protocolVersion: PROTOCOL_VERSION };

    return new Promise<CommandResult>((resolve, reject) => {
      const timer = setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error(`Command '${tool}' timed out after ${COMMAND_TIMEOUT_MS}ms — is the Studio plugin running?`));
        }
      }, COMMAND_TIMEOUT_MS);

      this.pending.set(id, {
        resolve: (r) => { clearTimeout(timer); resolve(r); },
        reject,
      });

      if (this.pollWaiter) {
        const waiter = this.pollWaiter;
        this.pollWaiter = null;
        waiter(cmd);
      } else {
        this.queue.push(cmd);
      }
    });
  }

  start(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.app
        .listen(this.port, "127.0.0.1", () => {
          process.stderr.write(`[RobloxForge] HTTP bridge on 127.0.0.1:${this.port}\n`);
          resolve();
        })
        .on("error", reject);
    });
  }
}
