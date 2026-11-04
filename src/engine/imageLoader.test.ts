import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parsePngToGrid, rgbaToHex } from "./imageLoader";

describe("rgbaToHex", () => {
  it("encodes all four channels with leading zeros", () => {
    expect(rgbaToHex(255, 0, 0, 255)).toBe("#ff0000ff");
    expect(rgbaToHex(0, 1, 15, 128)).toBe("#00010f80");
    expect(rgbaToHex(0, 0, 0, 0)).toBe("#00000000");
  });

  it.each([-1, 256, 1.5, NaN, Infinity])("rejects invalid byte %s", (value) => {
    expect(() => rgbaToHex(value, 0, 0, 255)).toThrow(RangeError);
    expect(() => rgbaToHex(0, value, 0, 255)).toThrow(RangeError);
    expect(() => rgbaToHex(0, 0, value, 255)).toThrow(RangeError);
    expect(() => rgbaToHex(0, 0, 0, value)).toThrow(RangeError);
  });
});

describe("parsePngToGrid", () => {
  let images: HTMLImageElement[];
  let context: CanvasRenderingContext2D;
  let canvases: HTMLCanvasElement[];

  beforeEach(() => {
    images = [];
    canvases = [];
    vi.stubGlobal("Image", vi.fn(function () {
      const image = document.createElement("img");
      images.push(image);
      return image;
    }));
    const mockContext: Partial<CanvasRenderingContext2D> = {
      imageSmoothingEnabled: true,
      drawImage: vi.fn(),
      getImageData: vi.fn((): ImageData => ({
        data: new Uint8ClampedArray([
          255, 0, 0, 255, 12, 34, 56, 0,
          0, 1, 15, 128, 255, 255, 255, 255,
        ]),
        width: 2, height: 2, colorSpace: "srgb",
      })),
    };
    context = mockContext as CanvasRenderingContext2D;
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(function (this: HTMLCanvasElement) {
      canvases.push(this);
      return context;
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("parses row-major pixels, preserving partial alpha and null transparency", async () => {
    const result = parsePngToGrid("/vanilla_base/item/test.png", 2);
    expect(images[0].getAttribute("src")).toBe("/vanilla_base/item/test.png");
    expect(images[0].crossOrigin).toBe("anonymous");
    images[0].dispatchEvent(new Event("load"));

    expect(await result).toEqual([
      ["#ff0000ff", null],
      ["#00010f80", "#ffffffff"],
    ]);
    expect(context.drawImage).toHaveBeenCalledWith(images[0], 0, 0, 2, 2);
    expect(context.getImageData).toHaveBeenCalledWith(0, 0, 2, 2);
    expect(context.imageSmoothingEnabled).toBe(false);
    expect([canvases[0].width, canvases[0].height]).toEqual([2, 2]);
    expect(canvases[0].isConnected).toBe(false);
    expect(images[0].onload).toBeNull();
    expect(images[0].onerror).toBeNull();
  });

  it("returns independent rows and grids across parses", async () => {
    const first = parsePngToGrid("first.png", 2);
    images[0].dispatchEvent(new Event("load"));
    const second = parsePngToGrid("second.png", 2);
    images[1].dispatchEvent(new Event("load"));
    const a = await first;
    const b = await second;
    a[0][0] = null;
    expect(a[1][0]).toBe("#00010f80");
    expect(b[0][0]).toBe("#ff0000ff");
  });

  it("preserves rectangular sprite sheets without squashing them into a square", async () => {
    vi.mocked(context.getImageData).mockReturnValueOnce({
      data: new Uint8ClampedArray([
        255, 0, 0, 255, 0, 255, 0, 128, 0, 0, 255, 0,
      ]),
      width: 1, height: 3, colorSpace: "srgb",
    });
    const result = parsePngToGrid("/vanilla_base/block/lava_still.png", 1, 3);
    images[0].dispatchEvent(new Event("load"));
    expect(await result).toEqual([["#ff0000ff"], ["#00ff0080"], [null]]);
    expect([canvases[0].width, canvases[0].height]).toEqual([1, 3]);
    expect(context.drawImage).toHaveBeenCalledWith(images[0], 0, 0, 1, 3);
    expect(context.getImageData).toHaveBeenCalledWith(0, 0, 1, 3);
  });

  it("rejects image load failures and detaches handlers", async () => {
    const result = parsePngToGrid("missing.png", 2);
    images[0].dispatchEvent(new Event("error"));
    await expect(result).rejects.toThrow("Unable to load PNG texture: missing.png");
    expect(images[0].onload).toBeNull();
    expect(images[0].onerror).toBeNull();
  });

  it("rejects a missing canvas context", async () => {
    vi.mocked(HTMLCanvasElement.prototype.getContext).mockReturnValueOnce(null);
    const result = parsePngToGrid("test.png", 2);
    images[0].dispatchEvent(new Event("load"));
    await expect(result).rejects.toThrow("2D context");
  });

  it.each(["drawImage", "getImageData"] as const)("propagates %s failures", async (method) => {
    vi.mocked(context[method]).mockImplementationOnce(() => {
      throw new Error("Cannot read texture");
    });
    const result = parsePngToGrid("test.png", 2);
    images[0].dispatchEvent(new Event("load"));
    await expect(result).rejects.toThrow("Cannot read texture");
  });

  it.each([0, -1, 1.5, NaN, Infinity])("rejects invalid size %s", async (size) => {
    await expect(parsePngToGrid("test.png", size)).rejects.toThrow(RangeError);
    await expect(parsePngToGrid("test.png", 16, size)).rejects.toThrow(RangeError);
    expect(images).toHaveLength(0);
  });

  it("rejects an empty URL", async () => {
    await expect(parsePngToGrid("  ", 16)).rejects.toThrow("URL");
  });
});
