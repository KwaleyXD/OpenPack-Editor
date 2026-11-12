<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, toRaw, watch } from "vue";
import {
  renderCanvas,
  type EngineState,
  type Layer,
  type PixelColor,
} from "../../engine/canvasEngine";
import { usePackStore } from "../../stores/packState";
import { createFrameScheduler } from "../../engine/frameScheduler";
import { getCanvasTransform, zoomAtPoint } from "../../logic/viewportLogic";
import { frameLayers, getFrameRect, onionFrameSteps, readFrame, writeFrame } from "../../logic/animationLogic";
import { DEFAULT_TEXTURE_BY_PATH } from "../../logic/assetManifest";
import { textureSource } from "../../logic/numberedTextureGroups";
import { parsePngToGrid } from "../../engine/imageLoader";
import { applySelection, copySelection, magicSelection, rectangleSelection, selectionPath, type PixelClipboard, type Selection } from "../../logic/selectionLogic";
import {
  applyFloodFill, applyFillAll, applyPencil, applyEraser, applyDitherPen, applyShade, shadeColor,
  applyLine, applyRectangle, applyCircle, getMirroredCoordinates, pickColor, forEachLinePoint,
  type SymmetryOptions,
} from "../../logic/toolLogic";

const uiScale = 32;
const packStore = usePackStore();
const canvasRef = ref<HTMLCanvasElement | null>(null);
const containerRef = ref<HTMLDivElement | null>(null);
const viewportSize = ref<{ width: number; height: number } | null>(null);
const zoomLevel = ref(1);
const zoomReadout = computed(() => {
  const percent = zoomLevel.value * 100;
  return `${percent >= 1 ? Number(percent.toFixed(1)) : percent.toPrecision(2)}%`;
});
const panOffset = ref({ x: 0, y: 0 });
const spaceHeld = ref(false);
const isPanning = ref(false);
const hoverPosition = ref<{ clientX: number; clientY: number } | null>(null);
let panDrag: { x: number; y: number; button: number } | null = null;
let resizeObserver: ResizeObserver | null = null;
const isDrawing = ref(false);
const pixelGrid = ref(true);
const tileMode = ref(false);
const tileMaskOpacity = ref(100);
let viewBeforeTile: { zoomLevel: number; panOffset: { x: number; y: number } } | null = null;
const numberedOnionFrames = ref<Layer[][]>([]);
const onionError = ref("");
let strokeHasSnapshot = false;
let strokeMarkedEdited = false;
let shadedPixels = new Set<string>();
let previousPixel: { x: number; y: number } | null = null;
let rightErase = false;
let selecting: { start: { x: number; y: number } } | null = null;
let moving: {
  start: { x: number; y: number };
  selection: Selection;
  pixels: PixelClipboard;
  original: PixelColor[][];
  preview: PixelColor[][];
  x: number;
  y: number;
  pasted: boolean;
} | null = null;
const displayedSelection = computed(() => packStore.selection);
const selectionStyle = computed(() => {
  const selection = displayedSelection.value;
  if (!selection) return undefined;
  const { x, y, scale } = transform.value;
  return {
    left: `${x + selection.x * scale}px`, top: `${y + selection.y * scale}px`,
    width: `${selection.mask[0].length * scale}px`, height: `${selection.mask.length * scale}px`,
  };
});
let shape: {
  tool: "line" | "rectangle" | "circle";
  layer: Layer;
  start: { x: number; y: number };
  end?: { x: number; y: number };
  original: PixelColor[][];
  preview: PixelColor[][];
  color: string;
  filled: boolean;
  symmetry: SymmetryOptions;
} | null = null;

function symmetryOptions(): SymmetryOptions {
  return { horizontal: packStore.symmetryHorizontal, vertical: packStore.symmetryVertical };
}

const engineState = computed<EngineState>(() => ({
  width: packStore.frameWidth,
  height: packStore.frameHeight,
  layers: packStore.frameLayers,
}));
const canvasWidth = computed(() => viewportSize.value?.width ?? packStore.frameWidth * uiScale);
const canvasHeight = computed(() => viewportSize.value?.height ?? packStore.frameHeight * uiScale);
const view = computed(() => ({ zoomLevel: zoomLevel.value, panOffset: panOffset.value }));
const transform = computed(() => getCanvasTransform(
  packStore.frameWidth, packStore.frameHeight, canvasWidth.value, canvasHeight.value, uiScale, view.value,
));
const tileStyles = computed(() => {
  const offsets = tileMode.value ? [-1, 0, 1] : [0];
  const { x, y, scale } = transform.value;
  return offsets.flatMap((tileY) => offsets.map((tileX) => {
    const left = Math.round(x + tileX * packStore.frameWidth * scale);
    const top = Math.round(y + tileY * packStore.frameHeight * scale);
    return {
      key: `${tileX},${tileY}`,
      center: tileX === 0 && tileY === 0,
      style: {
        left: `${left}px`, top: `${top}px`,
        width: `${Math.round(x + (tileX + 1) * packStore.frameWidth * scale) - left}px`,
        height: `${Math.round(y + (tileY + 1) * packStore.frameHeight * scale) - top}px`,
        backgroundSize: `${scale}px ${scale}px`,
      },
    };
  }));
});
const hoverStyle = computed(() => {
  if (!hoverPosition.value || isPanning.value || spaceHeld.value) return null;
  const pixel = getGridCoordinates(hoverPosition.value);
  if (!pixel) return null;
  const { x, y, scale } = transform.value;
  const left = Math.round(x + pixel.x * scale);
  const top = Math.round(y + pixel.y * scale);
  return {
    left: `${left}px`,
    top: `${top}px`,
    width: `${Math.round(x + (pixel.x + 1) * scale) - left}px`,
    height: `${Math.round(y + (pixel.y + 1) * scale) - top}px`,
  };
});

let canvasContext: CanvasRenderingContext2D | null = null;

function redraw() {
  if (!canvasContext) {
    throw new Error("Canvas 2D context is not initialized.");
  }

  const preview = shape?.preview ?? moving?.preview;
  const previewLayer = shape?.layer.id ?? (moving ? packStore.layers[packStore.activeLayerIndex]?.id : undefined);
  const state = preview ? {
    ...engineState.value,
    layers: engineState.value.layers.map((layer) => layer.id === previewLayer
      ? { ...layer, data: preview } : layer),
  } : engineState.value;
  const animation = packStore.activeAnimation;
  const onionFrames = animation ? onionFrameSteps(packStore.activeFrameIndex, animation.frames.length, packStore.onionSkinRange)
    .map((step) => frameLayers(toRaw(packStore.layers), getFrameRect(animation, step))) : numberedOnionFrames.value;
  renderCanvas(canvasContext, state, uiScale, packStore.activeLayerIndex, packStore.onionSkinRange, view.value,
    { showGrid: pixelGrid.value, onionFrames, tileMode: tileMode.value });
}
const frame = createFrameScheduler(redraw);

watch(() => [packStore.activeItemId, packStore.onionSkinRange, packStore.categories, packStore.width, packStore.height] as const,
  async (_values, _previous, onCleanup) => {
    let cancelled = false;
    onCleanup(() => { cancelled = true; });
    numberedOnionFrames.value = [];
    onionError.value = "";
    const group = packStore.activeNumberedGroup;
    if (!group || packStore.onionSkinRange === 0) return;
    const index = group.frames.findIndex((item) => item.id === packStore.activeItemId);
    const steps = onionFrameSteps(index, group.frames.length, packStore.onionSkinRange);
    try {
      const frames = await Promise.all(steps.map(async (step) => {
        const item = group.frames[step];
        if (item.savedLayers) return item.savedLayers;
        const { url, key } = textureSource(item.filePath);
        const texture = DEFAULT_TEXTURE_BY_PATH.get(key);
        const width = texture?.width ?? 16;
        const height = texture?.height ?? 16;
        const data = await parsePngToGrid(url, width, height);
        return [{ id: "layer-0", name: "Vanilla Base", visible: true, data }];
      }));
      if (cancelled) return;
      if (frames.some((layers) => layers[0].data.length !== packStore.frameHeight ||
        layers[0].data[0].length !== packStore.frameWidth)) {
        throw new Error("Neighboring frames must have the same dimensions for onion skinning.");
      }
      numberedOnionFrames.value = frames;
    } catch (error) {
      if (!cancelled) onionError.value = `Unable to show onion skin: ${error instanceof Error ? error.message : String(error)}`;
    }
  }, { immediate: true });

function getGridCoordinates(
  event: Pick<MouseEvent, "clientX" | "clientY">,
): { x: number; y: number } | null {
  const canvas = canvasRef.value;

  if (!canvas) {
    return null;
  }

  const bounds = canvas.getBoundingClientRect();
  // Match the rounded pixel edges used by the renderer at fractional zoom levels.
  const x = Math.floor((event.clientX - bounds.left + 0.5 - transform.value.x) / transform.value.scale);
  const y = Math.floor((event.clientY - bounds.top + 0.5 - transform.value.y) / transform.value.scale);

  if (x < 0 || y < 0 || x >= engineState.value.width || y >= engineState.value.height) {
    return null;
  }

  return { x, y };
}

function updateHover(event: MouseEvent) {
  hoverPosition.value = { clientX: event.clientX, clientY: event.clientY };
}

function leaveCanvas() {
  hoverPosition.value = null;
  stopDrawing();
}

function measureViewport() {
  const bounds = containerRef.value?.getBoundingClientRect();
  if (bounds && bounds.width > 0 && bounds.height > 0) {
    const width = Math.round(bounds.width), height = Math.round(bounds.height);
    if (viewportSize.value?.width !== width || viewportSize.value?.height !== height) {
      viewportSize.value = { width, height };
    }
  }
}

function setZoom(next: number, x = canvasWidth.value / 2, y = canvasHeight.value / 2) {
  const updated = zoomAtPoint(view.value, next, { x, y }, {
    x: canvasWidth.value / 2, y: canvasHeight.value / 2,
  });
  zoomLevel.value = updated.zoomLevel;
  panOffset.value = updated.panOffset;
}

function wheelZoom(event: WheelEvent) {
  cancelDrawing();
  const bounds = canvasRef.value?.getBoundingClientRect();
  if (!bounds) return;
  const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? canvasHeight.value : 1;
  const delta = Math.min(1000, Math.max(-1000, event.deltaY * unit));
  setZoom(zoomLevel.value * Math.exp(-delta * 0.0015), event.clientX - bounds.left, event.clientY - bounds.top);
  updateHover(event);
}

function resetView() {
  cancelDrawing();
  zoomLevel.value = tileMode.value
    ? Math.min(1, canvasWidth.value / (3 * packStore.frameWidth * uiScale),
      canvasHeight.value / (3 * packStore.frameHeight * uiScale))
    : 1;
  panOffset.value = { x: 0, y: 0 };
}

function toggleTileMode() {
  cancelDrawing();
  stopPan();
  if (!tileMode.value) {
    viewBeforeTile = { zoomLevel: zoomLevel.value, panOffset: { ...panOffset.value } };
    tileMode.value = true;
    resetView();
  } else {
    tileMode.value = false;
    if (viewBeforeTile) {
      zoomLevel.value = viewBeforeTile.zoomLevel;
      panOffset.value = viewBeforeTile.panOffset;
      viewBeforeTile = null;
    }
  }
}

function startInteraction(event: MouseEvent) {
  if (event.target === canvasRef.value) canvasRef.value?.focus({ preventScroll: true });
  if (event.button === 1 || (event.button === 0 && spaceHeld.value)) {
    event.preventDefault();
    cancelDrawing();
    panDrag = { x: event.clientX, y: event.clientY, button: event.button };
    isPanning.value = true;
  } else if (event.target === canvasRef.value) {
    event.preventDefault();
    startDrawing(event);
  }
}

function movePan(event: MouseEvent) {
  if (!panDrag) return;
  const mask = panDrag.button === 1 ? 4 : 1;
  if ((event.buttons & mask) === 0) {
    stopPan();
    return;
  }
  panOffset.value = {
    x: panOffset.value.x + event.clientX - panDrag.x,
    y: panOffset.value.y + event.clientY - panDrag.y,
  };
  panDrag.x = event.clientX;
  panDrag.y = event.clientY;
}

function stopPan() {
  panDrag = null;
  isPanning.value = false;
}

function releaseMouse(event: MouseEvent) {
  if (panDrag) stopPan();
  else finishDrawing(event);
}

function loseFocus() {
  hoverPosition.value = null;
  spaceHeld.value = false;
  stopPan();
  cancelDrawing();
}

function releaseSpace(event: KeyboardEvent) {
  if (event.code === "Space" || event.key === " ") spaceHeld.value = false;
}

function paintStroke(event: MouseEvent) {
  const coordinates = getGridCoordinates(event);
  if (!coordinates) {
    previousPixel = null;
    return;
  }
  const start = previousPixel ?? coordinates;
  const layer = packStore.layers[packStore.activeLayerIndex];
  if (!layer) throw new RangeError("The active layer does not exist.");
  const data = packStore.activeAnimation ? readFrame(toRaw(layer.data), packStore.frameRect) : toRaw(layer.data);
  let changed = false;
  forEachLinePoint(start.x, start.y, coordinates.x, coordinates.y, (x, y) => {
    if (paintPixel(x, y, data)) changed = true;
  });
  if (changed) {
    if (packStore.activeAnimation) writeFrame(toRaw(layer.data), packStore.frameRect, data);
    packStore.renderRevision += 1;
  }
  previousPixel = isDrawing.value ? coordinates : null;
}

function paintPixel(x: number, y: number, data: PixelColor[][]) {
  const layer = packStore.layers[packStore.activeLayerIndex];

  if (!layer) {
    throw new RangeError("The active layer does not exist.");
  }

  if (!layer.visible) {
    return;
  }

  // Hot-path writes use one explicit revision per input event rather than
  // notifying and traversing the reactive grid for every interpolated pixel.
  const currentColor = pickColor(data, x, y);
  const tool = rightErase ? "eraser" : packStore.activeTool;

  if (tool === "eyedropper") {
    if (currentColor !== null) {
      packStore.setActiveColor(currentColor);
    }
    return;
  }

  const color = tool === "eraser" ? null : packStore.activeColor;
  const isFill = tool === "bucket" || tool === "fill-all";
  const symmetry = symmetryOptions();
  if (tool === "shade") {
    const points = getMirroredCoordinates(data, x, y, symmetry);
    if (points.every(({ x: px, y: py }) => shadedPixels.has(`${px},${py}`))) return;
    points.forEach(({ x: px, y: py }) => shadedPixels.add(`${px},${py}`));
    if (points.every(({ x: px, y: py }) => {
      const pixel = data[py][px];
      return pixel === null || shadeColor(pixel, packStore.shadeMode) === pixel;
    })) return;
  }
  if (tool === "dither" && (x + y) % 2 !== 0) {
    return;
  }
  if (tool !== "shade" && (isFill ? currentColor === color :
    getMirroredCoordinates(data, x, y, symmetry)
      .every((point) => data[point.y][point.x] === color))) {
    return;
  }

  if (isFill || !strokeHasSnapshot) {
    packStore.saveHistorySnapshot();
    strokeHasSnapshot = true;
  }

  if (tool === "fill-all") {
    applyFillAll(data, x, y, packStore.activeColor);
  } else if (tool === "bucket") {
    applyFloodFill(data, x, y, packStore.activeColor, symmetry);
  } else if (tool === "eraser") {
    applyEraser(data, x, y, symmetry);
  } else if (tool === "dither") {
    applyDitherPen(data, x, y, packStore.activeColor, symmetry);
  } else if (tool === "shade") {
    applyShade(data, x, y, packStore.shadeMode, symmetry);
  } else {
    applyPencil(data, x, y, color, symmetry);
  }

  if (packStore.activeItemId && !strokeMarkedEdited) {
    packStore.markItemEdited(packStore.activeItemId);
    strokeMarkedEdited = true;
  }
  return true;
}

function updateShape(event: MouseEvent) {
  if (!shape) return;
  const end = getGridCoordinates(event);
  if (!end) return;
  if (shape.end?.x === end.x && shape.end?.y === end.y) return;
  shape.end = end;
  const data = shape.original.map((row) => [...row]);
  const { x, y } = shape.start;
  if (shape.tool === "line") {
    applyLine(data, x, y, end.x, end.y, shape.color, shape.symmetry);
  } else if (shape.tool === "rectangle") {
    applyRectangle(data, x, y, end.x, end.y, shape.color, shape.filled, shape.symmetry);
  } else {
    applyCircle(data, x, y, end.x, end.y, shape.color, shape.filled, shape.symmetry);
  }
  shape.preview = data;
  frame.request();
}

function updateSelectionDrag(event: MouseEvent) {
  const point = getGridCoordinates(event);
  if (!point) return;
  if (selecting) {
    packStore.selection = rectangleSelection(selecting.start.x, selecting.start.y, point.x, point.y);
  } else if (moving) {
    const width = moving.selection.mask[0].length, height = moving.selection.mask.length;
    // The selection may leave the frame but must keep at least one pixel inside it.
    moving.x = Math.max(1 - width, Math.min(packStore.frameWidth - 1, moving.selection.x + point.x - moving.start.x));
    moving.y = Math.max(1 - height, Math.min(packStore.frameHeight - 1, moving.selection.y + point.y - moving.start.y));
    moving.preview = applySelection(moving.original, moving.pixels, moving.x, moving.y,
      moving.pasted ? undefined : moving.selection);
    // The preview is not reactive, so request a render and selection overlay update.
    packStore.selection = { ...moving.selection, x: moving.x, y: moving.y };
    frame.request();
  }
}

function startDrawing(event: MouseEvent) {
  if (event.button !== 0 && event.button !== 2) {
    return;
  }

  stopDrawing();
  rightErase = event.button === 2;
  if (rightErase) {
    packStore.pastedBase = null;
    isDrawing.value = true;
    paintStroke(event);
    return;
  }
  const tool = packStore.activeTool;
  if (tool === "select-rectangle" || tool === "select-magic" || tool === "move") {
    const point = getGridCoordinates(event);
    const layer = packStore.layers[packStore.activeLayerIndex];
    if (!point || !layer?.visible || packStore.pendingItemId) return;
    const data = readFrame(toRaw(layer.data), packStore.frameRect);
    if (tool === "select-rectangle") {
      packStore.pastedBase = null;
      selecting = { start: point };
      packStore.selection = rectangleSelection(point.x, point.y, point.x, point.y);
    } else if (tool === "select-magic") {
      packStore.pastedBase = null;
      packStore.selection = magicSelection(data, point.x, point.y);
    } else {
      const selection = packStore.selection;
      if (!selection || !selection.mask[point.y - selection.y]?.[point.x - selection.x]) return;
      moving = {
        start: point, selection, pixels: copySelection(data, selection),
        original: packStore.pastedBase ?? data, preview: data,
        x: selection.x, y: selection.y, pasted: packStore.pastedBase !== null,
      };
    }
    packStore.selectionToolError = "";
    return;
  }
  if (tool === "line" || tool === "rectangle" || tool === "circle") {
    const start = getGridCoordinates(event);
    const layer = packStore.layers[packStore.activeLayerIndex];
    if (!start || !layer?.visible) return;
    shape = {
      tool, layer, start, original: readFrame(toRaw(layer.data), packStore.frameRect),
      preview: readFrame(toRaw(layer.data), packStore.frameRect), color: packStore.activeColor,
      filled: packStore.shapeFilled, symmetry: symmetryOptions(),
    };
    isDrawing.value = true;
    updateShape(event);
    return;
  }
  isDrawing.value = tool === "pencil" || tool === "eraser" || tool === "dither" || tool === "shade";
  paintStroke(event);
}

function continueDrawing(event: MouseEvent) {
  if (isPanning.value || spaceHeld.value) return;
  if ((event.buttons & (rightErase ? 2 : 1)) === 0) {
    stopDrawing();
    return;
  }
  if (selecting || moving) {
    updateSelectionDrag(event);
    return;
  }
  if (shape) {
    updateShape(event);
    return;
  }
  if (isDrawing.value &&
    (rightErase || packStore.activeTool === "pencil" || packStore.activeTool === "eraser" ||
      packStore.activeTool === "dither" || packStore.activeTool === "shade")) {
    paintStroke(event);
  }
}

function stopDrawing() {
  selecting = null;
  if (moving) {
    const { selection, preview, x, y, pasted } = moving;
    moving = null;
    if (x !== selection.x || y !== selection.y) {
      if (!pasted) packStore.saveHistorySnapshot();
      writeFrame(toRaw(packStore.layers[packStore.activeLayerIndex].data), packStore.frameRect, preview);
      packStore.renderRevision += 1;
      if (packStore.activeItemId) packStore.markItemEdited(packStore.activeItemId);
    }
    frame.request();
  }
  if (shape) {
    const { layer, preview, original } = shape;
    shape = null;
    if (layer.visible && packStore.layers[packStore.activeLayerIndex] === layer &&
      preview.some((row, y) => row.some((color, x) => color !== original[y][x]))) {
      packStore.saveHistorySnapshot();
      writeFrame(toRaw(layer.data), packStore.frameRect, preview);
      packStore.renderRevision += 1;
      if (packStore.activeItemId) packStore.markItemEdited(packStore.activeItemId);
    }
    frame.request();
  }
  isDrawing.value = false;
  strokeHasSnapshot = false;
  strokeMarkedEdited = false;
  shadedPixels.clear();
  previousPixel = null;
  rightErase = false;
}

function finishDrawing(event: MouseEvent) {
  if (selecting || moving) updateSelectionDrag(event);
  if (shape) updateShape(event);
  stopDrawing();
}

function cancelDrawing() {
  const hadPreview = shape !== null || moving !== null;
  if (moving) packStore.selection = moving.selection;
  selecting = null;
  moving = null;
  shape = null;
  isDrawing.value = false;
  strokeHasSnapshot = false;
  strokeMarkedEdited = false;
  shadedPixels.clear();
  previousPixel = null;
  rightErase = false;
  if (hadPreview && canvasContext && packStore.activeLayerIndex < packStore.layers.length) {
    frame.request();
  }
}

function handleHistoryShortcut(event: KeyboardEvent) {
  const target = event.target;
  if (document.querySelector("dialog[open]") ||
    (target instanceof HTMLElement &&
      target.closest("input, textarea, select, [contenteditable]:not([contenteditable='false'])"))) {
    return;
  }
  if (event.code === "Space" || event.key === " ") {
    spaceHeld.value = true;
    if (target instanceof HTMLElement && target.closest("button, a")) return;
    event.preventDefault();
    cancelDrawing();
    return;
  }
  if (event.key === "Escape" && (shape || selecting || moving || packStore.selection)) {
    event.preventDefault();
    cancelDrawing();
    packStore.clearSelection();
    return;
  }
  if (!(event.ctrlKey || event.metaKey) || event.altKey) {
    return;
  }
  const key = event.key.toLowerCase();
  if (!event.shiftKey && key === "d" && packStore.selection) {
    event.preventDefault();
    cancelDrawing();
    packStore.clearSelection();
    return;
  }
  if (!event.shiftKey && key === "c" && packStore.selection) {
    event.preventDefault();
    packStore.copySelectedPixels();
    return;
  }
  if (!event.shiftKey && key === "v" && packStore.clipboard) {
    event.preventDefault();
    cancelDrawing();
    packStore.pasteSelectedPixels();
    return;
  }
  if (key !== "z" && key !== "y") {
    return;
  }

  event.preventDefault();
  cancelDrawing();
  if (key === "y" || event.shiftKey) {
    packStore.redo();
  } else {
    packStore.undo();
  }
}

onMounted(() => {
  const canvas = canvasRef.value;

  if (!canvas) {
    throw new Error("Canvas element is unavailable.");
  }

  canvasContext = canvas.getContext("2d");

  if (!canvasContext) {
    throw new Error("Unable to initialize the canvas 2D context.");
  }

  redraw();
  measureViewport();
  if (typeof ResizeObserver !== "undefined" && containerRef.value) {
    resizeObserver = new ResizeObserver(measureViewport);
    resizeObserver.observe(containerRef.value);
  }
  window.addEventListener("keydown", handleHistoryShortcut);
  window.addEventListener("keyup", releaseSpace);
  window.addEventListener("mousemove", movePan);
  window.addEventListener("mouseup", releaseMouse);
  window.addEventListener("blur", loseFocus);
  window.addEventListener("resize", measureViewport);
});

onUnmounted(() => {
  window.removeEventListener("keydown", handleHistoryShortcut);
  window.removeEventListener("keyup", releaseSpace);
  window.removeEventListener("mousemove", movePan);
  window.removeEventListener("mouseup", releaseMouse);
  window.removeEventListener("blur", loseFocus);
  window.removeEventListener("resize", measureViewport);
  resizeObserver?.disconnect();
  frame.cancel();
  shape = null;
});

watch(() => [
  packStore.activeTool, packStore.activeLayerIndex, packStore.activeItemId,
  packStore.pendingItemId, packStore.width, packStore.height, packStore.symmetryHorizontal,
  packStore.activeFrameIndex,
  packStore.symmetryVertical, packStore.shapeFilled,
  packStore.layers[packStore.activeLayerIndex],
  packStore.layers[packStore.activeLayerIndex]?.visible,
], cancelDrawing, { flush: "sync" });

watch(() => [
  packStore.activeItemId, packStore.activeFrameIndex, packStore.activeLayerIndex,
  packStore.layers[packStore.activeLayerIndex], packStore.width, packStore.height, packStore.pendingItemId,
], () => {
  packStore.selection = null;
  packStore.pastedBase = null;
  packStore.selectionToolError = "";
}, { flush: "sync" });
watch(() => packStore.activeTool, (tool) => {
  if (tool !== "move") packStore.pastedBase = null;
}, { flush: "sync" });
watch(() => packStore.selection, (selection) => {
  if (!selection) packStore.pastedBase = null;
}, { flush: "sync" });

watch(() => [packStore.activeItemId, packStore.categories], () => {
  cancelDrawing();
  stopPan();
  resetView();
});

// Navigation must not traverse the pixel grids on every wheel or pan event.
watch(() => [
  packStore.renderRevision,
  packStore.activeFrameIndex,
  packStore.activeLayerIndex, packStore.onionSkinRange, pixelGrid.value, tileMode.value,
  packStore.width, packStore.height, canvasWidth.value, canvasHeight.value, view.value, numberedOnionFrames.value,
], () => frame.request(), { flush: "post" });
</script>

<template>
  <div
    ref="containerRef"
    class="relative h-full min-h-0 w-full min-w-0 overflow-hidden bg-[#292929]"
    aria-label="Zoom and pan canvas"
    @wheel.prevent="wheelZoom"
    @mousedown="startInteraction"
  >
    <p v-if="onionError" role="alert" class="absolute left-2 top-2 z-10 rounded bg-zinc-900 p-2 text-xs text-red-400">{{ onionError }}</p>
    <div v-for="tile in tileStyles" :key="tile.key" aria-hidden="true"
      class="alpha-checkerboard pointer-events-none absolute" :style="tile.style" />
    <canvas
      ref="canvasRef"
      :width="canvasWidth"
      :height="canvasHeight"
      class="absolute left-0 top-0 block"
      :class="isPanning ? 'cursor-grabbing' : spaceHeld ? 'cursor-grab' : 'cursor-crosshair'"
      :aria-label="`${engineState.width} by ${engineState.height} pixel texture editor`"
      role="img"
      tabindex="0"
      @mouseenter="updateHover"
      @mousemove="updateHover($event); continueDrawing($event)"
      @mouseup="finishDrawing"
      @mouseleave="leaveCanvas"
      @contextmenu.prevent
    />
    <template v-if="tileMode">
      <div v-for="tile in tileStyles.filter((entry) => !entry.center)" :key="tile.key"
        aria-hidden="true" data-testid="tile-mask" class="alpha-checkerboard pointer-events-none absolute"
        :style="{ ...tile.style, opacity: (100 - tileMaskOpacity) / 100 }" />
    </template>
    <svg v-if="displayedSelection" aria-hidden="true" data-testid="selection-outline"
      class="pointer-events-none absolute overflow-visible" :style="selectionStyle"
      :viewBox="`0 0 ${displayedSelection.mask[0].length} ${displayedSelection.mask.length}`" preserveAspectRatio="none">
      <path :d="selectionPath(displayedSelection)" fill="none" stroke="black" stroke-width="3" vector-effect="non-scaling-stroke" />
      <path :d="selectionPath(displayedSelection)" fill="none" stroke="white" stroke-width="1.5" stroke-dasharray="4 3" vector-effect="non-scaling-stroke" />
    </svg>
    <div
      v-if="hoverStyle"
      aria-hidden="true"
      data-testid="pixel-hover"
      class="pointer-events-none absolute bg-white/25"
      :style="hoverStyle"
    />
    <div class="absolute bottom-3 right-3 flex max-w-[calc(100%-1.5rem)] flex-wrap items-center justify-end gap-2 rounded border border-zinc-600 bg-zinc-900/90 p-1 text-xs text-zinc-100" @mousedown.stop @wheel.stop>
      <button type="button" aria-label="Pixel grid" :aria-pressed="pixelGrid" class="rounded px-2 py-1 hover:bg-zinc-700" @click="pixelGrid = !pixelGrid">Grid</button>
      <button type="button" aria-label="Tile mode" :aria-pressed="tileMode" class="rounded px-2 py-1 hover:bg-zinc-700" @click="toggleTileMode">Tile</button>
      <label v-if="tileMode" class="flex items-center gap-1">
        <span>Tile opacity {{ tileMaskOpacity }}%</span>
        <input v-model.number="tileMaskOpacity" type="range" min="0" max="100" step="1"
          aria-label="Tile mask opacity" :aria-valuetext="`${tileMaskOpacity}%`" class="w-16 accent-sky-400" />
      </label>
      <button type="button" aria-label="Zoom out" class="rounded px-2 py-1 hover:bg-zinc-700" @click="setZoom(zoomLevel / 1.25)">-</button>
      <output aria-label="Zoom level" class="min-w-12 text-center">{{ zoomReadout }}</output>
      <button type="button" aria-label="Zoom in" class="rounded px-2 py-1 hover:bg-zinc-700" @click="setZoom(zoomLevel * 1.25)">+</button>
      <button type="button" class="rounded px-2 py-1 hover:bg-zinc-700" @click="resetView">Reset view</button>
    </div>
  </div>
</template>
