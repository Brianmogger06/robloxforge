import { setSessionPalette, getSessionPalette, getSessionColor, clearSessionPalette } from "../src/build/palette_session.js";

let pass = 0, fail = 0;
function assert(label: string, cond: boolean) {
  if (cond) { console.log(`  ✓ ${label}`); pass++; }
  else       { console.error(`  ✗ ${label}`); fail++; }
}

console.log("=== Phase 0: Session Isolation ===");

// Two sessions, independent state
setSessionPalette({ roles: { primary: "#FF0000", wall: "#AA0000" } }, "clientA");
setSessionPalette({ roles: { primary: "#0000FF", floor: "#000055" } }, "clientB");

assert("clientA primary is red",  getSessionColor("primary", "clientA") === "#FF0000");
assert("clientA wall set",        getSessionColor("wall",    "clientA") === "#AA0000");
assert("clientB primary is blue", getSessionColor("primary", "clientB") === "#0000FF");
assert("clientB floor set",       getSessionColor("floor",   "clientB") === "#000055");

// Cross-contamination check
assert("clientA floor is undefined (not clientB's)", getSessionColor("floor", "clientA") === undefined);
assert("clientB wall is undefined (not clientA's)",  getSessionColor("wall",  "clientB") === undefined);

// Default session untouched
assert("default session is empty", getSessionColor("primary") === undefined);

// clear only affects target session
clearSessionPalette("clientA");
assert("clientA cleared",               getSessionColor("primary", "clientA") === undefined);
assert("clientB survives clientA clear", getSessionColor("primary", "clientB") === "#0000FF");

// getSessionPalette round-trip
const pal = getSessionPalette("clientB");
assert("getSessionPalette roles intact", pal.roles["primary"] === "#0000FF");
assert("getSessionPalette returns copy", pal !== getSessionPalette("clientB"));

console.log(`\nResult: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
