export interface ValidationReport {
  valid: boolean;
  partCount?: number;
  overlaps: Array<{ a: string; b: string }>;
  floating: string[];
  badScale: Array<{ path: string; size: { x: number; y: number; z: number } }>;
  warnings: string[];
  errors: string[];
}

export interface AutoFixPlan {
  actions: AutoFixAction[];
  summary: string;
}

export interface AutoFixAction {
  kind: "anchor" | "move" | "scale" | "delete";
  target: string;
  args?: Record<string, unknown>;
  reason: string;
}

/** Derive a minimal fix plan from a validation report. */
export function planAutoFix(report: ValidationReport, parent = "Workspace"): AutoFixPlan {
  const actions: AutoFixAction[] = [];

  for (const f of report.floating) {
    actions.push({ kind: "anchor", target: f, args: { Anchored: true }, reason: "floating part" });
  }

  for (const bs of report.badScale) {
    const { x, y, z } = bs.size;
    const clamped = {
      x: Math.min(2048, Math.max(0.1, x)),
      y: Math.min(2048, Math.max(0.1, y)),
      z: Math.min(2048, Math.max(0.1, z)),
    };
    actions.push({ kind: "scale", target: bs.path, args: { Size: clamped }, reason: "invalid scale" });
  }

  // For overlaps we only log — automated spatial repositioning needs more context
  for (const ov of report.overlaps) {
    actions.push({
      kind: "move",
      target: ov.b,
      args: { offsetY: 0.5 },
      reason: `overlaps with ${ov.a}`,
    });
  }

  const parts = actions.length;
  return {
    actions,
    summary: parts === 0
      ? "No fixes required — build is clean."
      : `${parts} fix action(s) planned for parent "${parent}".`,
  };
}

export interface IterationResult {
  iteration: number;
  buildReport: ValidationReport;
  gameReport: ValidationReport;
  fixPlan: AutoFixPlan;
  clean: boolean;
}

/** Build the ADR body for a completed autonomous iteration. */
export function buildIterationAdr(results: IterationResult[]): string {
  const last = results[results.length - 1];
  if (!last) return "No iterations ran.";

  const lines: string[] = [
    `## Autonomous Iteration Summary`,
    ``,
    `Iterations: ${results.length}`,
    `Final state: ${last.clean ? "CLEAN" : "ISSUES REMAIN"}`,
    ``,
    `### Per-iteration results`,
  ];
  for (const r of results) {
    lines.push(
      `- Iter ${r.iteration}: overlaps=${r.buildReport.overlaps.length}, floating=${r.buildReport.floating.length}, ` +
      `fixes=${r.fixPlan.actions.length}, clean=${r.clean}`
    );
  }
  if (last.buildReport.warnings.length || last.gameReport.warnings.length) {
    lines.push("", "### Remaining warnings");
    for (const w of [...last.buildReport.warnings, ...last.gameReport.warnings]) {
      lines.push(`- ${w}`);
    }
  }
  return lines.join("\n");
}
