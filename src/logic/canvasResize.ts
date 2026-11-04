import type { PixelColor } from "../engine/canvasEngine";

export const CANVAS_ANCHORS = [
  "top-left", "top", "top-right",
  "left", "center", "right",
  "bottom-left", "bottom", "bottom-right",
] as const;

export type CanvasAnchor = typeof CANVAS_ANCHORS[number];

export function resizeLayer(
  data: PixelColor[][],
  newWidth: number,
  newHeight: number,
  anchor: CanvasAnchor,
  resizeContent: boolean,
): PixelColor[][] {
  if (!Number.isSafeInteger(newWidth) || newWidth <= 0 ||
    !Number.isSafeInteger(newHeight) || newHeight <= 0) {
    throw new RangeError("Canvas width and height must be positive integers.");
  }
  const anchorIndex = CANVAS_ANCHORS.indexOf(anchor);
  if (anchorIndex === -1) {
    throw new RangeError("Choose one of the nine canvas anchors.");
  }
  const oldHeight = data.length;
  const oldWidth = data[0]?.length ?? 0;
  if (!oldWidth || !oldHeight || data.some((row) => row.length !== oldWidth)) {
    throw new Error("Layer data must be a non-empty rectangular grid.");
  }
  const offsetX = Math.floor((newWidth - oldWidth) * (anchorIndex % 3) / 2);
  const offsetY = Math.floor((newHeight - oldHeight) * Math.floor(anchorIndex / 3) / 2);
  return Array.from({ length: newHeight }, (_, y) =>
    Array.from({ length: newWidth }, (_, x): PixelColor => {
      if (resizeContent) {
        return data[Math.floor(y * oldHeight / newHeight)][Math.floor(x * oldWidth / newWidth)];
      }
      const sourceX = x - offsetX;
      const sourceY = y - offsetY;
      return sourceY >= 0 && sourceY < oldHeight && sourceX >= 0 && sourceX < oldWidth
        ? data[sourceY][sourceX] : null;
    }),
  );
}
