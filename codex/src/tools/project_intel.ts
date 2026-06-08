import { readFileSync, writeFileSync, mkdirSync, readdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

// ─── analyze_self ─────────────────────────────────────────────────────────────

export function analyzeSelf(): unknown {
  const graphPath = join(dirname(fileURLToPath(import.meta.url)), "../../graphify-out/graph.json");
  const graph = JSON.parse(readFileSync(graphPath, "utf8")) as {
    nodes?: Array<{ id: string; label?: string; community?: number }>;
    links?: Array<{ source: string; target: string; relation?: string }>;
  };

  const nodeCount = graph.nodes?.length ?? 0;
  const edgeCount = graph.links?.length ?? 0;

  // Group nodes by community
  const communities: Record<string, string[]> = {};
  for (const node of graph.nodes ?? []) {
    const comm = String(node.community ?? "unknown");
    (communities[comm] ??= []).push(node.label ?? node.id);
  }

  // God nodes = highest combined degree
  const degree: Record<string, number> = {};
  for (const link of graph.links ?? []) {
    const src = String(link.source);
    const tgt = String(link.target);
    degree[src] = (degree[src] ?? 0) + 1;
    degree[tgt] = (degree[tgt] ?? 0) + 1;
  }
  const godNodes = Object.entries(degree)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([id, deg]) => ({ id, degree: deg }));

  return { nodeCount, edgeCount, communities, godNodes };
}

// ─── create_snapshot (hybrid: calls plugin, then writes to disk) ───────────────

export function writeSnapshot(root: string, data: unknown, label?: string): string {
  const ts = Date.now();
  const snapshotDir = join(root, "memory", "snapshots");
  mkdirSync(snapshotDir, { recursive: true });
  const slug = label ? `-${label.replace(/[^a-z0-9]/gi, "_")}` : "";
  const filename = `${ts}${slug}.json`;
  const filepath = join(snapshotDir, filename);
  writeFileSync(filepath, JSON.stringify({ label, timestamp: ts, ...(data as object) }, null, 2));
  return filepath;
}

// ─── diff_snapshot ────────────────────────────────────────────────────────────

interface Snapshot {
  timestamp?: number;
  label?: string;
  instanceTotal?: number;
  scriptCount?: number;
  partCount?: number;
  modelCount?: number;
  [key: string]: unknown;
}

export function diffSnapshots(pathA: string, pathB: string): unknown {
  const a = JSON.parse(readFileSync(pathA, "utf8")) as Snapshot;
  const b = JSON.parse(readFileSync(pathB, "utf8")) as Snapshot;

  const numericKeys = ["instanceTotal", "scriptCount", "partCount", "modelCount"] as const;
  const diff: Record<string, { before: number; after: number; delta: number }> = {};
  for (const key of numericKeys) {
    const before = (a[key] as number) ?? 0;
    const after  = (b[key] as number) ?? 0;
    diff[key] = { before, after, delta: after - before };
  }

  return {
    snapshotA: { path: pathA, timestamp: a.timestamp, label: a.label },
    snapshotB: { path: pathB, timestamp: b.timestamp, label: b.label },
    diff,
  };
}

// ─── list_snapshots ───────────────────────────────────────────────────────────

export function listSnapshots(root: string): unknown {
  const snapshotDir = join(root, "memory", "snapshots");
  try {
    const files = readdirSync(snapshotDir)
      .filter(f => f.endsWith(".json"))
      .sort()
      .reverse()
      .slice(0, 20)
      .map(f => ({ filename: f, path: join(snapshotDir, f) }));
    return { snapshots: files, count: files.length };
  } catch {
    return { snapshots: [], count: 0 };
  }
}
