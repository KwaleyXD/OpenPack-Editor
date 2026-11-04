import { describe, expect, it } from "vitest";
import { normalizeHex, hexToRgba, parsePalettes, PALETTE_PRESETS } from "./colorLogic";

describe("color logic", () => {
  it("normalizes hex case, optional hashes, and equivalent opaque alpha", () => {
    expect(normalizeHex(" AbCdEf ")).toBe("#abcdef");
    expect(normalizeHex("#ABCDEF80")).toBe("#abcdef80");
    expect(normalizeHex("#ABCDEFFF")).toBe("#abcdef");
  });

  it.each(["#fff", "#1234567", "#gg1234", "#123456789", "", "rgb(0,0,0)"])(
    "rejects invalid precise hex input %s", (value) => {
      expect(() => normalizeHex(value)).toThrow("6- or 8-digit");
    },
  );

  it("reads RGBA bytes without losing transparent alpha", () => {
    expect(hexToRgba("#00010f80")).toEqual({ r: 0, g: 1, b: 15, a: 128 });
    expect(hexToRgba("#ffffff")).toEqual({ r: 255, g: 255, b: 255, a: 255 });
    expect(hexToRgba("#12345600").a).toBe(0);
  });

  it("provides unique valid Minecraft-theme presets", () => {
    expect(PALETTE_PRESETS).toHaveLength(3);
    expect(new Set(PALETTE_PRESETS.map(({ id }) => id)).size).toBe(3);
    for (const preset of PALETTE_PRESETS) {
      expect(preset.colors.length).toBeGreaterThanOrEqual(16);
      expect(new Set(preset.colors).size).toBe(preset.colors.length);
      preset.colors.forEach((color) => expect(normalizeHex(color)).toBe(color));
    }
  });

  it("parses and normalizes saved palettes", () => {
    expect(parsePalettes('[{"id":"custom-test","name":"Test","colors":["ABCDEF80"]}]'))
      .toEqual([{ id: "custom-test", name: "Test", colors: ["#abcdef80"] }]);
  });

  it.each([
    "{}", "null", "broken", '[{"id":1,"name":"x","colors":[]}]',
    '[{"id":"x","name":"","colors":["#ffffff"]}]',
    '[{"id":"x","name":"x","colors":["invalid"]}]',
    '[{"id":"x","name":"x","colors":[1]}]',
    '[{"id":"x","name":"x","colors":["#ffffff"]},{"id":"x","name":"y","colors":["#000000"]}]',
  ])("rejects malformed custom palettes: %s", (serialized) => {
    expect(() => parsePalettes(serialized)).toThrow();
  });
});
