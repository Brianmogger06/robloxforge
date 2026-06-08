export type PaletteRole = 'primary' | 'secondary' | 'accent' | 'floor' | 'wall' | 'trim';

export interface SessionPalette {
  roles: Partial<Record<PaletteRole, string>>;
  source?: string;
}

// Keyed by sessionId — prevents cross-contamination when multiple MCP clients connect.
const sessions = new Map<string, SessionPalette>();

function getOrCreate(sessionId: string): SessionPalette {
  let s = sessions.get(sessionId);
  if (!s) { s = { roles: {} }; sessions.set(sessionId, s); }
  return s;
}

export function setSessionPalette(palette: SessionPalette, sessionId = "default"): void {
  const s = getOrCreate(sessionId);
  s.roles = { ...palette.roles };
  s.source = palette.source;
}

export function getSessionColor(role: PaletteRole, sessionId = "default"): string | undefined {
  return sessions.get(sessionId)?.roles[role];
}

export function getSessionPalette(sessionId = "default"): SessionPalette {
  const s = sessions.get(sessionId) ?? { roles: {} };
  return { roles: { ...s.roles }, source: s.source };
}

export function clearSessionPalette(sessionId = "default"): void {
  sessions.delete(sessionId);
}
