export interface ColorPalette {
  id: string;
  name: string;
  colors: string[];
}

export const PALETTE_PRESETS: readonly ColorPalette[] = [
  {
    id: "earth", name: "Earth & stone",
    colors: [
      "#ffffff", "#b0b0b0", "#606060", "#181818",
      "#795548", "#a08050", "#d6c28a", "#567d46",
      "#305c32", "#249c93", "#3b6bcc", "#8a55b5",
      "#e34b40", "#ef8c32", "#f4d35e", "#ee8cb4",
    ],
  },
  {
    id: "wool", name: "Wool & concrete",
    colors: [
      "#e9ecec", "#f07613", "#bd44b3", "#3aafd9",
      "#f8c627", "#70b919", "#ed8dac", "#3e4447",
      "#8e8e86", "#158991", "#792aac", "#35399d",
      "#724728", "#546d1b", "#a12722", "#141519",
    ],
  },
  {
    id: "ores", name: "Ore highlights",
    colors: [
      "#242424", "#555555", "#929292", "#d8d8d8",
      "#674b33", "#c49b72", "#ffe394", "#f9c23c",
      "#104c53", "#23b9af", "#a0fff2", "#2c8a47",
      "#8fffa4", "#742525", "#e33e3e", "#956db5",
    ],
  },
];

export function normalizeHex(value: string): string {
  const hex = value.trim().replace(/^#/, "").toLowerCase();
  if (!/^(?:[\da-f]{6}|[\da-f]{8})$/.test(hex)) {
    throw new Error("Enter a 6- or 8-digit hex color (RRGGBB or RRGGBBAA).");
  }
  // Fully opaque colors share one canonical form for history deduplication.
  return `#${hex.length === 8 && hex.endsWith("ff") ? hex.slice(0, 6) : hex}`;
}

export function hexToRgba(value: string): { r: number; g: number; b: number; a: number } {
  const hex = normalizeHex(value).slice(1);
  return {
    r: parseInt(hex.slice(0, 2), 16),
    g: parseInt(hex.slice(2, 4), 16),
    b: parseInt(hex.slice(4, 6), 16),
    a: hex.length === 8 ? parseInt(hex.slice(6, 8), 16) : 255,
  };
}

export function parsePalettes(serialized: string): ColorPalette[] {
  const value: unknown = JSON.parse(serialized);
  if (!Array.isArray(value)) {
    throw new Error("Saved palettes must be an array.");
  }
  const palettes = value.map((entry: unknown): ColorPalette => {
    if (typeof entry !== "object" || entry === null ||
      !("id" in entry) || typeof entry.id !== "string" ||
      !("name" in entry) || typeof entry.name !== "string" || !entry.name.trim() ||
      !("colors" in entry) || !Array.isArray(entry.colors) || entry.colors.length === 0 ||
      entry.colors.some((color: unknown) => typeof color !== "string")) {
      throw new Error("A saved palette has invalid data.");
    }
    return {
      id: entry.id, name: entry.name,
      colors: entry.colors.map((color: string) => normalizeHex(color)),
    };
  });
  if (new Set(palettes.map(({ id }) => id)).size !== palettes.length) {
    throw new Error("Saved palette IDs must be unique.");
  }
  return palettes;
}
