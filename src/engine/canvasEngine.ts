import { getCanvasTransform, type CanvasView } from "../logic/viewportLogic";
import { resizeLayer } from "../logic/canvasResize";

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

export function scaleLayer(
  oldData: PixelColor[][],
  oldSize: number,
  newSize: number,
): PixelColor[][] {
  if (!Number.isSafeInteger(oldSize) || oldSize <= 0 ||
    !Number.isSafeInteger(newSize) || newSize <= 0) {
    throw new RangeError("Texture sizes must be positive integers.");
  }
  if (oldData.length !== oldSize || oldData.some((row) => row.length !== oldSize)) {
    throw new Error("Layer data must match the old square texture size.");
  }
  return resizeLayer(oldData, newSize, newSize, "center", true);
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
  activeLayerIndex: number,
  onionSkinRange: number,
  view?: CanvasView,
  options: { showGrid?: boolean } = {},
): void {
  if (!Number.isFinite(uiScale) || uiScale <= 0) {
    throw new RangeError("UI scale must be a positive finite number.");
  }
  if (!Number.isInteger(onionSkinRange) || onionSkinRange < 0 || onionSkinRange > 3) {
    throw new RangeError("Onion skin range must be an integer from 0 to 3.");
  }
  if (!Number.isInteger(activeLayerIndex) || activeLayerIndex < 0 ||
    activeLayerIndex >= Math.max(1, state.layers.length)) {
    throw new RangeError("The active layer index is out of bounds.");
  }

  const transform = view
    ? getCanvasTransform(state.width, state.height, context.canvas.width, context.canvas.height, uiScale, view)
    : { x: 0, y: 0, scale: uiScale };
  const left = (x: number) => view ? Math.round(transform.x + x * transform.scale) : x * uiScale;
  const top = (y: number) => view ? Math.round(transform.y + y * transform.scale) : y * uiScale;
  const firstX = view ? Math.max(0, Math.floor(-transform.x / transform.scale)) : 0;
  const firstY = view ? Math.max(0, Math.floor(-transform.y / transform.scale)) : 0;
  const lastX = view ? Math.min(state.width, Math.ceil((context.canvas.width - transform.x) / transform.scale)) : state.width;
  const lastY = view ? Math.min(state.height, Math.ceil((context.canvas.height - transform.y) / transform.scale)) : state.height;
  context.imageSmoothingEnabled = false;
  context.clearRect(0, 0, context.canvas.width, context.canvas.height);
  context.globalAlpha = 1;

  for (const [index, layer] of state.layers.entries()) {
    const distance = Math.abs(activeLayerIndex - index);
    if (!layer.visible || distance > onionSkinRange) {
      continue;
    }

    context.globalAlpha = 1 / Math.pow(2, distance);
    for (let y = firstY; y < lastY; y += 1) {
      for (let x = firstX; x < lastX; x += 1) {
        const color = layer.data[y]?.[x];

        if (color !== null && color !== undefined) {
          context.fillStyle = color;
          context.fillRect(left(x), top(y), left(x + 1) - left(x), top(y + 1) - top(y));
        }
      }
    }
    context.globalAlpha = 1;
  }

  if (options.showGrid === false || (view && transform.scale < 4)) return;
  context.save();
  context.strokeStyle = "rgba(0, 0, 0, 0.18)";
  context.lineWidth = 1;

  for (let y = firstY; y < lastY; y += 1) {
    for (let x = firstX; x < lastX; x += 1) {
      context.strokeRect(left(x), top(y), left(x + 1) - left(x), top(y + 1) - top(y));
    }
  }

  context.restore();
}
