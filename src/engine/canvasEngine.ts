import { getCanvasTransform, type CanvasView } from "../logic/viewportLogic";
import { resizeLayer } from "../logic/canvasResize";

export type PixelColor = string | null;

export interface Layer {
  id: string;
  name: string;
  visible: boolean;
  opacity?: number;
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
  options: { showGrid?: boolean; onionFrames?: Layer[][] } = {},
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
  const left = (x: number) => Math.round(transform.x + x * transform.scale);
  const top = (y: number) => Math.round(transform.y + y * transform.scale);
  const firstX = view ? Math.max(0, Math.floor(-transform.x / transform.scale)) : 0;
  const firstY = view ? Math.max(0, Math.floor(-transform.y / transform.scale)) : 0;
  const lastX = view ? Math.min(state.width, Math.ceil((context.canvas.width - transform.x) / transform.scale)) : state.width;
  const lastY = view ? Math.min(state.height, Math.ceil((context.canvas.height - transform.y) / transform.scale)) : state.height;
  const minified = transform.scale < 1;
  const sampleLeft = Math.max(0, left(0)), sampleTop = Math.max(0, top(0));
  const sampleRight = Math.min(context.canvas.width, left(state.width));
  const sampleBottom = Math.min(context.canvas.height, top(state.height));
  context.imageSmoothingEnabled = false;
  context.clearRect(0, 0, context.canvas.width, context.canvas.height);
  context.globalAlpha = 1;

  const passes = [
    ...state.layers.map((layer) => ({ layer, opacity: 1 })),
    ...(options.onionFrames ?? []).flatMap((layers) => layers.map((layer) => ({ layer, opacity: 0.3 }))),
  ];
  for (const { layer, opacity } of passes) {
    if (!layer.visible) {
      continue;
    }

    context.globalAlpha = opacity * (layer.opacity ?? 1);
    if (minified) {
      // Sample destination pixel centers; tiny thumbnails should not paint every source cell.
      for (let y = sampleTop; y < sampleBottom; y += 1) {
        const sourceY = Math.max(0, Math.min(state.height - 1, Math.floor((y + 0.5 - transform.y) / transform.scale)));
        for (let x = sampleLeft; x < sampleRight; x += 1) {
          const sourceX = Math.max(0, Math.min(state.width - 1, Math.floor((x + 0.5 - transform.x) / transform.scale)));
          const color = layer.data[sourceY]?.[sourceX];
          if (color !== null && color !== undefined) {
            context.fillStyle = color;
            context.fillRect(x, y, 1, 1);
          }
        }
      }
      continue;
    }
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

  context.globalAlpha = 1;
  if (options.showGrid === false || transform.scale < 4) return;
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
