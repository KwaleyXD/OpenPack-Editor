import type { PixelColor } from "../engine/canvasEngine";

export interface Selection {
  x: number;
  y: number;
  mask: boolean[][];
}

export interface PixelClipboard {
  pixels: PixelColor[][];
  mask: boolean[][];
}

export function rectangleSelection(x1: number, y1: number, x2: number, y2: number): Selection {
  const x = Math.min(x1, x2), y = Math.min(y1, y2);
  return {
    x, y,
    mask: Array.from({ length: Math.abs(y2 - y1) + 1 }, () =>
      Array<boolean>(Math.abs(x2 - x1) + 1).fill(true)),
  };
}

export function magicSelection(data: PixelColor[][], x: number, y: number): Selection {
  const height = data.length, width = data[0].length;
  const target = data[y][x];
  const visited = new Uint8Array(width * height);
  const stack = [y * width + x];
  const points: number[] = [];
  visited[stack[0]] = 1;
  let minX = x, maxX = x, minY = y, maxY = y;
  while (stack.length) {
    const point = stack.pop()!;
    const px = point % width, py = Math.floor(point / width);
    points.push(point);
    minX = Math.min(minX, px); maxX = Math.max(maxX, px);
    minY = Math.min(minY, py); maxY = Math.max(maxY, py);
    for (const [nx, ny] of [[px - 1, py], [px + 1, py], [px, py - 1], [px, py + 1]]) {
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
      const next = ny * width + nx;
      if (!visited[next] && data[ny][nx] === target) {
        visited[next] = 1;
        stack.push(next);
      }
    }
  }
  const mask = Array.from({ length: maxY - minY + 1 }, () => Array<boolean>(maxX - minX + 1).fill(false));
  for (const point of points) mask[Math.floor(point / width) - minY][point % width - minX] = true;
  return { x: minX, y: minY, mask };
}

export function copySelection(data: PixelColor[][], selection: Selection): PixelClipboard {
  return {
    mask: selection.mask.map((row) => [...row]),
    pixels: selection.mask.map((row, y) => row.map((selected, x) =>
      selected ? data[selection.y + y][selection.x + x] : null)),
  };
}

export function applySelection(
  data: PixelColor[][], clipboard: PixelClipboard, x: number, y: number,
  source?: Selection,
): PixelColor[][] {
  const result = data.map((row) => [...row]);
  if (source) {
    source.mask.forEach((row, sy) => row.forEach((selected, sx) => {
      if (selected) result[source.y + sy][source.x + sx] = null;
    }));
  }
  clipboard.mask.forEach((row, sy) => row.forEach((selected, sx) => {
    const pixel = clipboard.pixels[sy][sx];
    if (selected && pixel !== null) result[y + sy][x + sx] = pixel;
  }));
  return result;
}

export function selectionPath(selection: Selection): string {
  const mask = selection.mask;
  const edges: string[] = [];
  mask.forEach((row, y) => row.forEach((selected, x) => {
    if (!selected) return;
    if (!mask[y - 1]?.[x]) edges.push(`M${x} ${y}h1`);
    if (!mask[y + 1]?.[x]) edges.push(`M${x} ${y + 1}h1`);
    if (!row[x - 1]) edges.push(`M${x} ${y}v1`);
    if (!row[x + 1]) edges.push(`M${x + 1} ${y}v1`);
  }));
  return edges.join(" ");
}
