// UI layout-tree presets. Trees are consumed by the plugin's buildGuiNode,
// which supports UICorner, UIPadding, UIListLayout, UIGridLayout, UIStroke,
// UIGradient, UIAspectRatioConstraint, text alignment and ScrollingFrame props.

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
  textXAlignment?: "Left" | "Center" | "Right";
  textYAlignment?: "Top" | "Center" | "Bottom";
  richText?: boolean;
  autoButtonColor?: boolean;
  rotation?: number;
  image?: string;
  cornerRadius?: number;
  stroke?: { color?: string; thickness?: number; transparency?: number };
  gradient?: { from: string; to: string; rotation?: number };
  aspectRatio?: number;
  padding?: { top?: number; bottom?: number; left?: number; right?: number };
  listLayout?: { fillDirection?: "Vertical" | "Horizontal"; padding?: number; horizontalAlignment?: string; verticalAlignment?: string };
  gridLayout?: { cellSize: [number, number]; cellPadding?: number };
  scrollBarThickness?: number;
  automaticCanvasSize?: "X" | "Y" | "XY";
  zIndex?: number;
  visible?: boolean;
  children?: UiNode[];
}

// ─── Theme tokens ─────────────────────────────────────────────────────────────

export const UI_THEME = {
  bg:        "#10131a",
  panel:     "#1a1f2a",
  panelHi:   "#242b3a",
  accent:    "#4f8ff7",
  accentLo:  "#3a6cc4",
  green:     "#3ecf6a",
  greenLo:   "#2c9a4e",
  gold:      "#f7c948",
  goldLo:    "#cc9f2e",
  danger:    "#e25555",
  text:      "#eef1f6",
  textDim:   "#8a93a6",
  strokeCol: "#3a4254",
};

const T = UI_THEME;

function frame(overrides: Partial<UiNode> = {}): UiNode {
  return { kind: "Frame", backgroundTransparency: 0, borderSizePixel: 0, ...overrides };
}
function label(text: string, overrides: Partial<UiNode> = {}): UiNode {
  return { kind: "TextLabel", text, backgroundTransparency: 1, textScaled: true, font: "GothamBold", textColor: T.text, ...overrides };
}
function button(text: string, overrides: Partial<UiNode> = {}): UiNode {
  return {
    kind: "TextButton", text, textScaled: true, font: "GothamBold",
    textColor: T.text, autoButtonColor: true, borderSizePixel: 0, ...overrides,
  };
}
/** Card panel: rounded, stroked, subtle vertical gradient. */
function card(overrides: Partial<UiNode> = {}): UiNode {
  return frame({
    backgroundColor: T.panel, cornerRadius: 12,
    stroke: { color: T.strokeCol, thickness: 1, transparency: 0.25 },
    gradient: { from: "#222937", to: T.panel, rotation: 90 },
    ...overrides,
  });
}

// ─── Presets ──────────────────────────────────────────────────────────────────

export function hudLayout(options: { playerName?: string } = {}): UiNode {
  return frame({
    name: "HUD", size: [1, 1], backgroundTransparency: 1,
    children: [
      // Health bar, bottom-left: track + gradient fill + label
      card({
        name: "HealthBar", size: [0.22, 0.038], position: [0.015, 0.94],
        cornerRadius: 8, backgroundColor: "#15181f",
        children: [
          frame({
            name: "Fill", size: [0.8, 1], backgroundColor: T.green, cornerRadius: 8,
            gradient: { from: "#52e082", to: T.greenLo, rotation: 90 },
          }),
          label("100 HP", { name: "HealthLabel", size: [1, 0.8], position: [0, 0.1], textSize: 14 }),
        ],
      }),
      // Player chip, top-left: avatar dot + name
      card({
        name: "PlayerChip", size: [0.16, 0.05], position: [0.015, 0.02], cornerRadius: 10,
        children: [
          frame({
            name: "Avatar", size: [0.18, 0.7], position: [0.04, 0.15],
            backgroundColor: T.accent, cornerRadius: 99, aspectRatio: 1,
            gradient: { from: "#6aa4ff", to: T.accentLo, rotation: 45 },
          }),
          label(options.playerName ?? "Player", {
            name: "PlayerName", size: [0.7, 0.64], position: [0.27, 0.18],
            textXAlignment: "Left", textSize: 16,
          }),
        ],
      }),
    ],
  });
}

export function menuLayout(options: { title?: string; subtitle?: string; buttons?: string[] } = {}): UiNode {
  const btns = (options.buttons ?? ["Play", "Settings", "Quit"]).map((b, i) =>
    button(b, {
      name: `Btn_${b}`, size: [0.82, 0.105],
      backgroundColor: i === 0 ? T.accent : T.panelHi,
      cornerRadius: 10, textSize: 18,
      gradient: i === 0
        ? { from: "#6aa4ff", to: T.accentLo, rotation: 90 }
        : { from: "#2a3242", to: T.panelHi, rotation: 90 },
      stroke: { color: i === 0 ? "#7ab0ff" : T.strokeCol, thickness: 1, transparency: 0.35 },
    })
  );
  return card({
    name: "MainMenu", size: [0.32, 0.62],
    position: [0.5, 0.5], anchorPoint: [0.5, 0.5],
    backgroundColor: T.bg, cornerRadius: 16,
    children: [
      frame({
        name: "Header", size: [1, 0.2], backgroundColor: T.panel, cornerRadius: 16,
        gradient: { from: "#2a3346", to: T.bg, rotation: 90 },
        children: [
          label(options.title ?? "Game", { name: "Title", size: [1, 0.6], position: [0, 0.12], textSize: 30 }),
          label(options.subtitle ?? "", {
            name: "Subtitle", size: [1, 0.26], position: [0, 0.68],
            textColor: T.textDim, textSize: 13, font: "Gotham",
          }),
        ],
      }),
      frame({
        name: "Buttons", size: [1, 0.74], position: [0, 0.23],
        backgroundTransparency: 1,
        listLayout: { fillDirection: "Vertical", padding: 10, horizontalAlignment: "Center" },
        padding: { top: 8 },
        children: btns,
      }),
    ],
  });
}

export function inventoryLayout(options: { slots?: number } = {}): UiNode {
  const count = options.slots ?? 9;
  const slots = Array.from({ length: count }, (_, i) =>
    frame({
      name: `Slot_${i + 1}`, size: [0.1, 1],
      backgroundColor: i === 0 ? T.panelHi : "#20242e", cornerRadius: 8, aspectRatio: 1,
      stroke: { color: i === 0 ? T.accent : T.strokeCol, thickness: i === 0 ? 2 : 1, transparency: i === 0 ? 0 : 0.4 },
      gradient: { from: "#2a3040", to: "#1c212c", rotation: 90 },
      children: [
        label(`${i + 1}`, {
          name: "Keybind", size: [0.34, 0.3], position: [0.62, 0.66],
          textColor: T.textDim, textSize: 11, font: "Gotham",
        }),
      ],
    })
  );
  return card({
    name: "Inventory", size: [0.52, 0.085], position: [0.5, 0.965], anchorPoint: [0.5, 1],
    backgroundColor: "#141821", cornerRadius: 12,
    children: [
      frame({
        name: "Slots", size: [0.985, 0.86], position: [0.0075, 0.07],
        backgroundTransparency: 1,
        listLayout: { fillDirection: "Horizontal", padding: 5, horizontalAlignment: "Center", verticalAlignment: "Center" },
        children: slots,
      }),
    ],
  });
}

export function shopLayout(options: { title?: string; items?: Array<{ name: string; price: number; description?: string }> } = {}): UiNode {
  const items = (options.items ?? [
    { name: "Speed Boost", price: 100, description: "+25% walk speed" },
    { name: "Shield",      price: 200, description: "Absorbs one hit" },
    { name: "Double XP",   price: 300, description: "15 minutes of 2× XP" },
  ]).map(item =>
    frame({
      name: `Item_${item.name}`, size: [0.96, 0.16],
      backgroundColor: T.panelHi, cornerRadius: 10,
      stroke: { color: T.strokeCol, thickness: 1, transparency: 0.35 },
      gradient: { from: "#2a3140", to: "#222837", rotation: 90 },
      children: [
        frame({
          name: "Icon", size: [0.13, 0.72], position: [0.025, 0.14],
          backgroundColor: T.accentLo, cornerRadius: 8, aspectRatio: 1,
          gradient: { from: "#5a90e8", to: "#34568c", rotation: 45 },
        }),
        label(item.name, {
          name: "ItemName", size: [0.42, 0.42], position: [0.18, 0.12],
          textXAlignment: "Left", textSize: 15,
        }),
        label(item.description ?? "", {
          name: "ItemDesc", size: [0.42, 0.3], position: [0.18, 0.55],
          textXAlignment: "Left", textColor: T.textDim, textSize: 11, font: "Gotham",
        }),
        button(`$${item.price}`, {
          name: "BuyBtn", size: [0.2, 0.6], position: [0.77, 0.2],
          backgroundColor: T.green, cornerRadius: 8, textSize: 14,
          gradient: { from: "#52e082", to: T.greenLo, rotation: 90 },
          stroke: { color: "#5ee88e", thickness: 1, transparency: 0.4 },
        }),
      ],
    })
  );
  return card({
    name: "Shop", size: [0.38, 0.68], position: [0.5, 0.5], anchorPoint: [0.5, 0.5],
    backgroundColor: T.bg, cornerRadius: 16,
    children: [
      frame({
        name: "Header", size: [1, 0.11], backgroundColor: T.panel, cornerRadius: 16,
        gradient: { from: "#2a3346", to: T.bg, rotation: 90 },
        children: [
          label(options.title ?? "SHOP", {
            name: "Title", size: [0.6, 0.62], position: [0.04, 0.19],
            textColor: T.gold, textXAlignment: "Left", textSize: 22,
          }),
          button("✕", {
            name: "CloseBtn", size: [0.085, 0.6], position: [0.89, 0.2],
            backgroundColor: T.danger, cornerRadius: 8, textSize: 14, aspectRatio: 1,
          }),
        ],
      }),
      {
        kind: "ScrollingFrame", name: "ItemList",
        size: [0.95, 0.84] as [number, number], position: [0.025, 0.13] as [number, number],
        backgroundTransparency: 1, borderSizePixel: 0,
        scrollBarThickness: 4, automaticCanvasSize: "Y" as const,
        listLayout: { fillDirection: "Vertical" as const, padding: 8, horizontalAlignment: "Center" },
        padding: { top: 4, right: 6 },
        children: items,
      },
    ],
  });
}

export function tycoonLayout(options: { moneyLabel?: string; incomeLabel?: string } = {}): UiNode {
  return frame({
    name: "TycoonUI", size: [1, 1], backgroundTransparency: 1,
    children: [
      card({
        name: "MoneyDisplay", size: [0.17, 0.075], position: [0.5, 0.025], anchorPoint: [0.5, 0],
        backgroundColor: "#141821", cornerRadius: 12,
        children: [
          frame({
            name: "CoinIcon", size: [0.16, 0.55], position: [0.045, 0.12],
            backgroundColor: T.gold, cornerRadius: 99, aspectRatio: 1,
            gradient: { from: "#ffe082", to: T.goldLo, rotation: 45 },
          }),
          label(options.moneyLabel ?? "0", {
            name: "Amount", size: [0.68, 0.5], position: [0.26, 0.1],
            textXAlignment: "Left", textSize: 20,
          }),
          label(options.incomeLabel ?? "+0/s", {
            name: "Income", size: [0.68, 0.3], position: [0.26, 0.6],
            textXAlignment: "Left", textColor: T.green, textSize: 12, font: "Gotham",
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
    case "inventory": return inventoryLayout(options as Parameters<typeof inventoryLayout>[0]);
    case "shop":      return shopLayout(options as Parameters<typeof shopLayout>[0]);
    case "tycoon":    return tycoonLayout(options as Parameters<typeof tycoonLayout>[0]);
    default: throw new Error(`Unknown UI preset '${name}'. Available: hud, menu, inventory, shop, tycoon`);
  }
}

/** Validate that every node has a kind and no orphaned children */
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
