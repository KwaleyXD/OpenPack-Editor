import type { PixelColor } from "../engine/canvasEngine";

export type DrawingTool = "pencil" | "eraser" | "bucket" | "eyedropper" |
  "line" | "rectangle" | "circle" | "dither" | "fill-all";

export interface SymmetryOptions {
  /** Mirror left/right across the canvas's vertical center axis. */
  horizontal?: boolean;
  /** Mirror top/bottom across the canvas's horizontal center axis. */
  vertical?: boolean;
}

export function getMirroredCoordinates(
  data: PixelColor[][],
  x: number,
  y: number,
  symmetry: SymmetryOptions = {},
): Array<{ x: number; y: number }> {
  assertCoordinates(data, x, y);
  const width = data[y].length;
  if ((symmetry.horizontal || symmetry.vertical) &&
    data.some((row) => row.length !== width)) {
    throw new Error("Symmetry requires a rectangular pixel grid.");
  }
  const xs = symmetry.horizontal ? new Set([x, width - 1 - x]) : new Set([x]);
  const ys = symmetry.vertical ? new Set([y, data.length - 1 - y]) : new Set([y]);
  return [...ys].flatMap((py) => [...xs].map((px) => ({ x: px, y: py })));
}

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
  symmetry: SymmetryOptions = {},
): void {
  for (const point of getMirroredCoordinates(layerData, x, y, symmetry)) {
    layerData[point.y][point.x] = color;
  }
}

export function applyEraser(
  layerData: PixelColor[][], x: number, y: number, symmetry: SymmetryOptions = {},
): void {
  applyPencil(layerData, x, y, null, symmetry);
}

export function applyDitherPen(
  layerData: PixelColor[][], x: number, y: number, color: string,
  symmetry: SymmetryOptions = {},
): void {
  assertCoordinates(layerData, x, y);
  if ((x + y) % 2 === 0) {
    applyPencil(layerData, x, y, color, symmetry);
  }
}

export function applyLine(
  layerData: PixelColor[][],
  x0: number, y0: number, x1: number, y1: number,
  color: string, symmetry: SymmetryOptions = {},
): void {
  assertCoordinates(layerData, x0, y0);
  assertCoordinates(layerData, x1, y1);
  const dx = Math.abs(x1 - x0);
  const dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let error = dx + dy;
  while (true) {
    applyPencil(layerData, x0, y0, color, symmetry);
    if (x0 === x1 && y0 === y1) break;
    const doubledError = 2 * error;
    if (doubledError >= dy) {
      error += dy;
      x0 += sx;
    }
    if (doubledError <= dx) {
      error += dx;
      y0 += sy;
    }
  }
}

export function applyRectangle(
  layerData: PixelColor[][],
  x0: number, y0: number, x1: number, y1: number,
  color: string, filled: boolean, symmetry: SymmetryOptions = {},
): void {
  assertCoordinates(layerData, x0, y0);
  assertCoordinates(layerData, x1, y1);
  const left = Math.min(x0, x1), right = Math.max(x0, x1);
  const top = Math.min(y0, y1), bottom = Math.max(y0, y1);
  for (let y = top; y <= bottom; y += 1) {
    for (let x = left; x <= right; x += 1) {
      if (filled || x === left || x === right || y === top || y === bottom) {
        applyPencil(layerData, x, y, color, symmetry);
      }
    }
  }
}

/** Samples pixel centers inside an ellipse; a four-neighbor boundary forms its outline. */
export function applyCircle(
  layerData: PixelColor[][],
  x0: number, y0: number, x1: number, y1: number,
  color: string, filled: boolean, symmetry: SymmetryOptions = {},
): void {
  assertCoordinates(layerData, x0, y0);
  assertCoordinates(layerData, x1, y1);
  const left = Math.min(x0, x1), right = Math.max(x0, x1);
  const top = Math.min(y0, y1), bottom = Math.max(y0, y1);
  if (left === right || top === bottom) {
    applyLine(layerData, left, top, right, bottom, color, symmetry);
    return;
  }
  const cx = (left + right) / 2, cy = (top + bottom) / 2;
  const rx = (right - left + 1) / 2, ry = (bottom - top + 1) / 2;
  const inside = (x: number, y: number) =>
    x >= left && x <= right && y >= top && y <= bottom &&
    ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1;
  for (let y = top; y <= bottom; y += 1) {
    for (let x = left; x <= right; x += 1) {
      if (inside(x, y) && (filled || !inside(x - 1, y) || !inside(x + 1, y) ||
        !inside(x, y - 1) || !inside(x, y + 1))) {
        applyPencil(layerData, x, y, color, symmetry);
      }
    }
  }
}

export function applyFloodFill(
  layerData: PixelColor[][],
  startX: number,
  startY: number,
  replacementColor: string,
  symmetry: SymmetryOptions = {},
): void {
  getMirroredCoordinates(layerData, startX, startY, symmetry);
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
  // Mirror only after traversal so mirrored writes cannot block the source region.
  if (symmetry.horizontal || symmetry.vertical) {
    for (const { x, y } of queue) {
      applyPencil(layerData, x, y, replacementColor, symmetry);
    }
  }
}

/** Replace matching pixels across the whole layer, regardless of connectivity. */
export function applyFillAll(
  layerData: PixelColor[][],
  x: number,
  y: number,
  replacementColor: string,
): void {
  assertCoordinates(layerData, x, y);
  const targetColor = layerData[y][x];
  if (targetColor === replacementColor) return;
  for (const row of layerData) {
    for (let column = 0; column < row.length; column += 1) {
      if (row[column] === targetColor) row[column] = replacementColor;
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