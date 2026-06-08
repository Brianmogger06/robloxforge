import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { resolve } from "path";

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function requireRoot(projectRoot: string): void {
  if (!projectRoot) throw new Error("projectRoot is not set in robloxforge.config.json");
  if (!existsSync(projectRoot)) throw new Error(`projectRoot does not exist: ${projectRoot}`);
}

function readFile(filePath: string): string {
  try { return readFileSync(filePath, "utf8"); } catch { return ""; }
}

function memoryDir(root: string): string {
  const dir = resolve(root, "memory");
  mkdirSync(dir, { recursive: true });
  return dir;
}

// ─── get_project_rules ────────────────────────────────────────────────────────

export function getProjectRules(projectRoot: string): string {
  requireRoot(projectRoot);

  const claudeMdPath = resolve(projectRoot, "CLAUDE.md");
  const raw = readFile(claudeMdPath);
  if (!raw) return "(no CLAUDE.md found at project root)";

  // Extract CRITICAL RULES and Design Pillars sections
  const sections: string[] = [];
  const patterns = [
    /^#{1,3}\s+critical rules?.*?(?=^#{1,3}\s|\z)/msi,
    /^#{1,3}\s+design pillars?.*?(?=^#{1,3}\s|\z)/msi,
    /^#{1,3}\s+architecture decisions?.*?(?=^#{1,3}\s|\z)/msi,
    /^#{1,3}\s+behavioral rules?.*?(?=^#{1,3}\s|\z)/msi,
  ];

  for (const pat of patterns) {
    const m = raw.match(pat);
    if (m) sections.push(m[0].trim());
  }

  return sections.length > 0
    ? sections.join("\n\n---\n\n")
    : raw.slice(0, 2000) + (raw.length > 2000 ? "\n\n...(truncated)" : "");
}

// ─── get_decisions ────────────────────────────────────────────────────────────

export function getDecisions(projectRoot: string, filter?: string): string {
  requireRoot(projectRoot);

  const dir = memoryDir(projectRoot);
  const content = readFile(resolve(dir, "decisions.md"));
  if (!content) return "(no decisions.md yet — use append_adr to create one)";

  if (!filter) return content;

  const lower = filter.toLowerCase();
  const lines = content.split("\n");
  const result: string[] = [];
  let include = false;

  for (const line of lines) {
    if (line.startsWith("## ADR-")) {
      include = line.toLowerCase().includes(lower);
    }
    if (include) result.push(line);
  }

  return result.length > 0
    ? result.join("\n")
    : `(no ADRs matching "${filter}")`;
}

// ─── append_adr ───────────────────────────────────────────────────────────────

export function appendAdr(
  projectRoot: string,
  title: string,
  body: string,
  id?: string
): { id: string; path: string } {
  requireRoot(projectRoot);

  const dir = memoryDir(projectRoot);
  const path = resolve(dir, "decisions.md");
  const existing = readFile(path);

  // Auto-number: find max existing ADR number
  let maxNum = 0;
  for (const m of existing.matchAll(/^## ADR-(\d+)/gm)) {
    const n = parseInt(m[1], 10);
    if (n > maxNum) maxNum = n;
  }
  const adrId = id ?? `ADR-${String(maxNum + 1).padStart(3, "0")}`;

  const date = new Date().toISOString().slice(0, 10);
  const entry = `\n## ${adrId}: ${title}\n_Date: ${date}_\n\n${body.trim()}\n`;

  const header = existing ? "" : "# Architecture Decision Records\n";
  writeFileSync(path, header + existing + entry, "utf8");

  return { id: adrId, path };
}

// ─── append_changelog ─────────────────────────────────────────────────────────

export function appendChangelog(
  projectRoot: string,
  heading: string,
  body: string
): { path: string } {
  requireRoot(projectRoot);

  const claudeMdPath = resolve(projectRoot, "CLAUDE.md");
  let content = readFile(claudeMdPath);

  const date = new Date().toISOString().slice(0, 10);
  const entry = `\n### ${date} — ${heading}\n${body.trim()}\n`;

  const marker = "## CHANGELOG";
  if (content.includes(marker)) {
    content = content.replace(marker, marker + entry);
  } else {
    content = content + `\n${marker}\n${entry}`;
  }

  writeFileSync(claudeMdPath, content, "utf8");
  return { path: claudeMdPath };
}

// ─── get_roadmap ──────────────────────────────────────────────────────────────

export function getRoadmap(projectRoot: string): string {
  requireRoot(projectRoot);

  const dir = memoryDir(projectRoot);
  const content = readFile(resolve(dir, "roadmap.md"));
  return content || "(no roadmap.md yet — use update_roadmap to create one)";
}

// ─── update_roadmap ───────────────────────────────────────────────────────────

export function updateRoadmap(projectRoot: string, content: string): { path: string } {
  requireRoot(projectRoot);

  const dir = memoryDir(projectRoot);
  const path = resolve(dir, "roadmap.md");
  writeFileSync(path, content.trim() + "\n", "utf8");
  return { path };
}
