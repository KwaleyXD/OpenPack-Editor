import type { Layer, PixelColor } from "../engine/canvasEngine";

export interface FrameRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface TextureAnimation {
  width: number;
  height: number;
  columns: number;
  rows: number;
  frames: Array<{ index: number; time: number }>;
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function positiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

export function parseAnimation(
  metadata: string | undefined, sourceWidth: number, sourceHeight: number,
  sheetWidth = sourceWidth, sheetHeight = sourceHeight,
): TextureAnimation | null {
  if (metadata === undefined) return null;
  const parsed: unknown = JSON.parse(metadata);
  if (!record(parsed) || parsed.animation === undefined) return null;
  const animation = parsed.animation;
  if (!record(animation)) throw new Error("Invalid texture animation metadata.");
  const width = animation.width ?? (animation.height === undefined ? Math.min(sourceWidth, sourceHeight) : sourceWidth);
  const height = animation.height ?? (animation.width === undefined ? Math.min(sourceWidth, sourceHeight) : sourceHeight);
  if (!positiveInteger(width) || !positiveInteger(height) ||
    sourceWidth % width !== 0 || sourceHeight % height !== 0) {
    throw new Error("Animation frame dimensions must divide the sprite sheet.");
  }
  const columns = sourceWidth / width, rows = sourceHeight / height;
  if (!positiveInteger(sheetWidth) || !positiveInteger(sheetHeight) ||
    sheetWidth % columns !== 0 || sheetHeight % rows !== 0) {
    throw new Error("Edited sprite-sheet dimensions do not match its frame layout.");
  }
  const time = animation.frametime ?? 1;
  if (!positiveInteger(time)) throw new Error("Animation frame time must be a positive integer.");
  const declaredFrames = animation.frames;
  if (declaredFrames !== undefined && !Array.isArray(declaredFrames)) throw new Error("Animation frames must be a list.");
  const entries = declaredFrames?.length ? declaredFrames : Array.from({ length: columns * rows }, (_, index) => index);
  const frames = entries.map((entry: unknown) => {
    const index = record(entry) ? entry.index : entry;
    const duration = record(entry) ? entry.time ?? time : time;
    if (typeof index !== "number" || !Number.isSafeInteger(index) || index < 0 ||
      index >= columns * rows || !positiveInteger(duration)) {
      throw new Error("Animation frame index or time is invalid.");
    }
    return { index, time: duration };
  });
  return { width: sheetWidth / columns, height: sheetHeight / rows, columns, rows, frames };
}

export function getFrameRect(animation: TextureAnimation, step: number): FrameRect {
  if (!Number.isInteger(step) || step < 0 || step >= animation.frames.length) {
    throw new RangeError("Animation frame is out of bounds.");
  }
  const index = animation.frames[step].index;
  return {
    x: (index % animation.columns) * animation.width,
    y: Math.floor(index / animation.columns) * animation.height,
    width: animation.width, height: animation.height,
  };
}

export function readFrame(data: PixelColor[][], rect: FrameRect): PixelColor[][] {
  return data.slice(rect.y, rect.y + rect.height).map((row) => row.slice(rect.x, rect.x + rect.width));
}

export function writeFrame(data: PixelColor[][], rect: FrameRect, frame: PixelColor[][]): void {
  if (frame.length !== rect.height || frame.some((row) => row.length !== rect.width)) {
    throw new Error("Frame pixels do not match the selected frame dimensions.");
  }
  for (let y = 0; y < rect.height; y++) {
    for (let x = 0; x < rect.width; x++) data[rect.y + y][rect.x + x] = frame[y][x];
  }
}

export function frameLayers(layers: Layer[], rect: FrameRect): Layer[] {
  return layers.map((layer) => ({ ...layer, data: readFrame(layer.data, rect) }));
}

export function onionFrameSteps(step: number, count: number, mode: number): number[] {
  if (!positiveInteger(count) || !Number.isInteger(step) || step < 0 || step >= count ||
    !Number.isInteger(mode) || mode < 0 || mode > 3) {
    throw new RangeError("Invalid animation frame or onion-skin mode.");
  }
  return [
    ...(mode === 1 || mode === 2 ? [step - 1] : []),
    ...(mode === 2 || mode === 3 ? [step + 1] : []),
  ].filter((index) => index >= 0 && index < count);
}
