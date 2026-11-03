export type PixelColor = string | null;

export interface Layer {
  id: string;
  name: string;
  visible: boolean;
  data: PixelColor[][];
}

export interface EngineState {
  width: number;
  height: number;
  layers: Layer[];
}

export const DEFAULT_ENGINE_WIDTH = 16;
export const DEFAULT_ENGINE_HEIGHT = 16;

export function initGrid(size: number): PixelColor[][] {
  if (!Number.isInteger(size) || size < 0) {
    throw new RangeError("Grid size must be a non-negative integer.");
  }

  return Array.from({ length: size }, () =>
    Array<PixelColor>(size).fill(null),
  );
}

export function createEngineState(
  width = DEFAULT_ENGINE_WIDTH,
  height = DEFAULT_ENGINE_HEIGHT,
): EngineState {
  if (!Number.isInteger(width) || width < 0) {
    throw new RangeError("Engine width must be a non-negative integer.");
  }

  if (!Number.isInteger(height) || height < 0) {
    throw new RangeError("Engine height must be a non-negative integer.");
  }

  return { width, height, layers: [] };
}

export function renderCanvas(
  context: CanvasRenderingContext2D,
  state: EngineState,
  uiScale: number,
): void {
  if (!Number.isFinite(uiScale) || uiScale <= 0) {
    throw new RangeError("UI scale must be a positive finite number.");
  }

  context.clearRect(0, 0, context.canvas.width, context.canvas.height);

  for (const layer of state.layers) {
    if (!layer.visible) {
      continue;
    }

    for (let y = 0; y < state.height; y += 1) {
      for (let x = 0; x < state.width; x += 1) {
        const color = layer.data[y]?.[x];

        if (color !== null && color !== undefined) {
          context.fillStyle = color;
          context.fillRect(x * uiScale, y * uiScale, uiScale, uiScale);
        }
      }
    }
  }

  context.save();
  context.strokeStyle = "rgba(0, 0, 0, 0.18)";
  context.lineWidth = 1;

  for (let y = 0; y < state.height; y += 1) {
    for (let x = 0; x < state.width; x += 1) {
      context.strokeRect(x * uiScale, y * uiScale, uiScale, uiScale);
    }
  }

  context.restore();
}