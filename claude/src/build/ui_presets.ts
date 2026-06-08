export interface UiNode {
  kind: string;
  name?: string;
  size?: [number, number];
  position?: [number, number];
  anchorPoint?: [number, number];
  backgroundColor?: string;
  backgroundTransparency?: number;
  borderSizePixel?: number;
  text?: string;
  textSize?: number;
  textColor?: string;
  font?: string;
  textScaled?: boolean;
  image?: string;
  cornerRadius?: number;
  padding?: { top?: number; bottom?: number; left?: number; right?: number };
  listLayout?: { fillDirection?: "Vertical" | "Horizontal"; padding?: number; horizontalAlignment?: string; verticalAlignment?: string };
  zIndex?: number;
  visible?: boolean;
  children?: UiNode[];
}

function frame(overrides: Partial<UiNode> = {}): UiNode {
  return { kind: "Frame", backgroundTransparency: 0, borderSizePixel: 0, ...overrides };
}
function label(text: string, overrides: Partial<UiNode> = {}): UiNode {
  return { kind: "TextLabel", text, backgroundTransparency: 1, textScaled: true, font: "GothamBold", ...overrides };
}
function button(text: string, overrides: Partial<UiNode> = {}): UiNode {
  return { kind: "TextButton", text, textScaled: true, font: "GothamBold", ...overrides };
}

// ─── Presets ──────────────────────────────────────────────────────────────────

export function hudLayout(options: { playerName?: string } = {}): UiNode {
  return frame({
    name: "HUD", size: [1, 1], backgroundTransparency: 1,
    children: [
      frame({
        name: "HealthBar", size: [0.2, 0.03], position: [0.01, 0.95],
        backgroundColor: "#222222", cornerRadius: 6,
        children: [
          frame({ name: "Fill", size: [0.8, 1], backgroundColor: "#44CC44", cornerRadius: 6 }),
          label("100 HP", { name: "HealthLabel", size: [1, 1], textColor: "#FFFFFF", textSize: 14 }),
        ],
      }),
      label(options.playerName ?? "Player", {
        name: "PlayerName", size: [0.15, 0.04], position: [0.01, 0.01],
        textColor: "#FFFFFF", textSize: 16,
      }),
    ],
  });
}

export function menuLayout(options: { title?: string; buttons?: string[] } = {}): UiNode {
  const btns = (options.buttons ?? ["Play", "Settings", "Quit"]).map((b, i) =>
    button(b, {
      name: `Btn_${b}`, size: [0.8, 0.08], backgroundColor: "#4488CC",
      textColor: "#FFFFFF", cornerRadius: 8,
    })
  );
  return frame({
    name: "MainMenu", size: [0.35, 0.6],
    position: [0.5, 0.5], anchorPoint: [0.5, 0.5],
    backgroundColor: "#1A1A2E", cornerRadius: 12,
    children: [
      label(options.title ?? "Game", {
        name: "Title", size: [1, 0.15], position: [0, 0.02],
        textColor: "#FFFFFF", textSize: 28,
      }),
      frame({
        name: "Buttons", size: [1, 0.75], position: [0, 0.2],
        backgroundTransparency: 1,
        listLayout: { fillDirection: "Vertical", padding: 8, horizontalAlignment: "Center" },
        children: btns,
      }),
    ],
  });
}

export function inventoryLayout(): UiNode {
  const slots = Array.from({ length: 9 }, (_, i) =>
    frame({
      name: `Slot_${i + 1}`, size: [0.1, 1],
      backgroundColor: "#2A2A2A", cornerRadius: 6,
      children: [label(`${i + 1}`, { name: "SlotNum", size: [1, 0.2], position: [0, 0.8], textColor: "#888888", textSize: 12 })],
    })
  );
  return frame({
    name: "Inventory", size: [0.6, 0.12], position: [0.5, 0.9], anchorPoint: [0.5, 0.5],
    backgroundColor: "#111111", cornerRadius: 8,
    children: [
      frame({
        name: "Slots", size: [0.98, 0.9], position: [0.01, 0.05],
        backgroundTransparency: 1,
        listLayout: { fillDirection: "Horizontal", padding: 4 },
        children: slots,
      }),
    ],
  });
}

export function shopLayout(options: { items?: Array<{ name: string; price: number }> } = {}): UiNode {
  const items = (options.items ?? [
    { name: "Speed Boost", price: 100 },
    { name: "Shield",      price: 200 },
    { name: "Double XP",   price: 300 },
  ]).map(item =>
    frame({
      name: `Item_${item.name}`, size: [0.9, 0.12],
      backgroundColor: "#2A2A3E", cornerRadius: 8,
      children: [
        label(item.name, { name: "ItemName", size: [0.6, 1], position: [0.05, 0], textColor: "#FFFFFF", textSize: 14 }),
        button(`$${item.price}`, { name: "BuyBtn", size: [0.25, 0.8], position: [0.72, 0.1], anchorPoint: [0, 0], backgroundColor: "#44AA44", textColor: "#FFFFFF", cornerRadius: 6, textSize: 13 }),
      ],
    })
  );
  return frame({
    name: "Shop", size: [0.4, 0.7], position: [0.5, 0.5], anchorPoint: [0.5, 0.5],
    backgroundColor: "#16162A", cornerRadius: 12,
    children: [
      label("Shop", { name: "Title", size: [1, 0.1], position: [0, 0.01], textColor: "#FFCC44", textSize: 22 }),
      frame({
        name: "ItemList", size: [0.95, 0.82], position: [0.025, 0.12],
        backgroundTransparency: 1,
        listLayout: { fillDirection: "Vertical", padding: 6, horizontalAlignment: "Center" },
        children: items,
      }),
    ],
  });
}

export function tycoonLayout(options: { moneyLabel?: string } = {}): UiNode {
  return frame({
    name: "TycoonUI", size: [1, 1], backgroundTransparency: 1,
    children: [
      frame({
        name: "MoneyDisplay", size: [0.18, 0.06], position: [0.41, 0.02],
        anchorPoint: [0, 0], backgroundColor: "#1A1A1A", cornerRadius: 8,
        children: [
          label("$", { name: "Symbol", size: [0.15, 1], textColor: "#FFCC44", textSize: 18 }),
          label(options.moneyLabel ?? "0", {
            name: "Amount", size: [0.8, 1], position: [0.18, 0],
            textColor: "#FFFFFF", textSize: 18,
          }),
        ],
      }),
    ],
  });
}

export type PresetName = "hud" | "menu" | "inventory" | "shop" | "tycoon";

export function getUiPreset(name: PresetName, options: Record<string, unknown> = {}): UiNode {
  switch (name) {
    case "hud":       return hudLayout(options as Parameters<typeof hudLayout>[0]);
    case "menu":      return menuLayout(options as Parameters<typeof menuLayout>[0]);
    case "inventory": return inventoryLayout();
    case "shop":      return shopLayout(options as Parameters<typeof shopLayout>[0]);
    case "tycoon":    return tycoonLayout(options as Parameters<typeof tycoonLayout>[0]);
    default: throw new Error(`Unknown UI preset '${name}'. Available: hud, menu, inventory, shop, tycoon`);
  }
}

/** Validate that every node has a position and no orphaned children */
export function validateUiLayout(node: UiNode, path = "root"): string[] {
  const errors: string[] = [];
  if (!node.kind) errors.push(`${path}: missing 'kind'`);
  if (node.children) {
    for (const child of node.children) {
      errors.push(...validateUiLayout(child, `${path}.${child.name ?? child.kind ?? "?"}`));
    }
  }
  return errors;
}
