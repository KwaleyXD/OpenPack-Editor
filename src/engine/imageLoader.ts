import type { PixelColor } from "./canvasEngine";

export function rgbaToHex(r: number, g: number, b: number, a: number): string {
  const channels = [r, g, b, a];
  if (channels.some((channel) => !Number.isInteger(channel) || channel < 0 || channel > 255)) {
    throw new RangeError("RGBA channels must be integers between 0 and 255.");
  }
  return `#${channels.map((channel) => channel.toString(16).padStart(2, "0")).join("")}`;
}

/** Decodes a rectangular image using nearest-neighbor sampling, preserving pixel alpha. */
export function parsePngToGrid(imageUrl: string, width: number, height = width): Promise<PixelColor[][]> {
  return new Promise((resolve, reject) => {
    if (!Number.isSafeInteger(width) || width <= 0 ||
      !Number.isSafeInteger(height) || height <= 0) {
      throw new RangeError("Image dimensions must be positive integers.");
    }
    if (!imageUrl.trim()) {
      throw new Error("Image URL must not be empty.");
    }

    const image = new Image();
    const cleanup = () => {
      image.onload = null;
      image.onerror = null;
    };
    image.crossOrigin = "anonymous";
    image.onload = () => {
      cleanup();
      try {
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext("2d");
        if (!context) {
          throw new Error("Unable to initialize the image-loading canvas 2D context.");
        }
        context.imageSmoothingEnabled = false;
        context.drawImage(image, 0, 0, width, height);
        const { data } = context.getImageData(0, 0, width, height);
        const grid = Array.from({ length: height }, () => Array<PixelColor>(width).fill(null));
        for (let y = 0; y < height; y += 1) {
          for (let x = 0; x < width; x += 1) {
            const offset = (y * width + x) * 4;
            const alpha = data[offset + 3];
            grid[y][x] = alpha === 0 ? null
              : rgbaToHex(data[offset], data[offset + 1], data[offset + 2], alpha);
          }
        }
        resolve(grid);
      } catch (error) {
        reject(error);
      }
    };
    image.onerror = () => {
      cleanup();
      reject(new Error(`Unable to load PNG texture: ${imageUrl}`));
    };
    image.src = imageUrl;
  });
}
