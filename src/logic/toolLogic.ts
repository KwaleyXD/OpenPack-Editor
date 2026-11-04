import type { PixelColor } from "../engine/canvasEngine";

export type DrawingTool = "pencil" | "eraser" | "bucket" | "eyedropper";

function isInBounds(data: PixelColor[][], x: number, y: number): boolean {
  return Number.isInteger(x) && Number.isInteger(y) &&
    y >= 0 && y < data.length && x >= 0 && x < data[y].length;
}

function assertCoordinates(data: PixelColor[][], x: number, y: number): void {
  if (!isInBounds(data, x, y)) {
    throw new RangeError("Pixel coordinates must be integers within the layer.");
  }
}

export function applyPencil(
  layerData: PixelColor[][],
  x: number,
  y: number,
  color: PixelColor,
): void {
  assertCoordinates(layerData, x, y);
  layerData[y][x] = color;
}

export function applyFloodFill(
  layerData: PixelColor[][],
  startX: number,
  startY: number,
  replacementColor: string,
): void {
  assertCoordinates(layerData, startX, startY);
  const targetColor = layerData[startY][startX];

  if (targetColor === replacementColor) {
    return;
  }

  const queue: Array<{ x: number; y: number }> = [{ x: startX, y: startY }];
  // Color on enqueue so each pixel enters the queue only once.
  layerData[startY][startX] = replacementColor;

  for (let head = 0; head < queue.length; head += 1) {
    const { x, y } = queue[head];
    const neighbors = [
      { x, y: y - 1 },
      { x, y: y + 1 },
      { x: x - 1, y },
      { x: x + 1, y },
    ];

    for (const neighbor of neighbors) {
      if (isInBounds(layerData, neighbor.x, neighbor.y) &&
        layerData[neighbor.y][neighbor.x] === targetColor) {
        layerData[neighbor.y][neighbor.x] = replacementColor;
        queue.push(neighbor);
      }
    }
  }
}

export function pickColor(
  layerData: PixelColor[][],
  x: number,
  y: number,
): PixelColor {
  assertCoordinates(layerData, x, y);
  return layerData[y][x];
}