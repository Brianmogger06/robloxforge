export type TimelineEventKind = "tween" | "vfx" | "ui" | "audio" | "callback";

export interface TimelineEvent {
  time: number;
  kind: TimelineEventKind;
  tool: string;
  args: Record<string, unknown>;
  label?: string;
}

export interface Timeline {
  name: string;
  duration: number;
  events: TimelineEvent[];
}

export function createTimeline(name: string, events: TimelineEvent[]): Timeline {
  // Sort by time
  const sorted = [...events].sort((a, b) => a.time - b.time);

  // Detect conflicts (same time, same parent, overlapping tweens)
  const conflicts: string[] = [];
  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i], b = sorted[i + 1];
    if (a.time === b.time && a.tool === b.tool && a.args["parent"] === b.args["parent"]) {
      conflicts.push(`Conflict at t=${a.time}: ${a.tool} and ${b.tool} on same parent`);
    }
  }

  const duration = sorted.length > 0 ? sorted[sorted.length - 1].time : 0;

  return { name, duration, events: sorted, ...(conflicts.length ? { conflicts } : {}) };
}

export function validateTimeline(tl: Timeline): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  for (const ev of tl.events) {
    if (ev.time < 0) errors.push(`Event '${ev.label ?? ev.tool}' has negative time ${ev.time}`);
    if (!ev.tool)    errors.push(`Event at t=${ev.time} has no tool`);
  }
  return { valid: errors.length === 0, errors };
}
