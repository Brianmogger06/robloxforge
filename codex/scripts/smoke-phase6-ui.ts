import { getUiPreset, validateUiLayout } from "../src/build/ui_presets.js";

let pass = 0, fail = 0;
function assert(label: string, cond: boolean) {
  if (cond) { console.log(`  ✓ ${label}`); pass++; }
  else       { console.error(`  ✗ ${label}`); fail++; }
}

console.log("=== Phase 6: UI Presets ===");

// Each preset is valid
for (const name of ["hud", "menu", "inventory", "shop", "tycoon"] as const) {
  const layout = getUiPreset(name);
  const errors = validateUiLayout(layout);
  assert(`${name} layout has no validation errors`, errors.length === 0);
  assert(`${name} has a kind`,                      !!layout.kind);
}

// HUD has health bar
const hud = getUiPreset("hud");
const healthBar = hud.children?.find(c => c.name === "HealthBar");
assert("HUD has HealthBar child",      !!healthBar);
assert("HealthBar has Fill child",     !!healthBar?.children?.find(c => c.name === "Fill"));

// Menu has configurable buttons
const menu = getUiPreset("menu", { title: "Prison Tycoon", buttons: ["Play", "Quit"] });
const btnsContainer = (menu.children ?? []).find(c => c.name === "Buttons");
assert("menu buttons count matches",   btnsContainer?.children?.length === 2);
const titleNode = (menu.children ?? []).find(c => c.name === "Title");
assert("menu title text is set",       titleNode?.text === "Prison Tycoon");

// Shop has item count
const shop = getUiPreset("shop", { items: [{ name: "Speed", price: 50 }, { name: "Shield", price: 100 }] });
const itemList = (shop.children ?? []).find(c => c.name === "ItemList");
assert("shop item count = 2",          itemList?.children?.length === 2);

// Unknown preset throws
let threw = false;
try { getUiPreset("unicorn" as any); } catch { threw = true; }
assert("unknown preset throws", threw);

// No orphan nodes (every node has kind)
function checkKinds(node: ReturnType<typeof getUiPreset>, path = "root"): boolean {
  if (!node.kind) { console.error(`  missing kind at ${path}`); return false; }
  return (node.children ?? []).every((c, i) => checkKinds(c, `${path}[${i}]`));
}
assert("all nodes have kind (hud)",       checkKinds(hud));
assert("all nodes have kind (inventory)", checkKinds(getUiPreset("inventory")));

console.log(`\nResult: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
