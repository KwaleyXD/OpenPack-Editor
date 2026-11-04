<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import {
  renderCanvas,
  type EngineState,
  type Layer,
  type PixelColor,
} from "../../engine/canvasEngine";
import { usePackStore } from "../../stores/packState";
import { getCanvasTransform, zoomAtPoint } from "../../logic/viewportLogic";
import {
  applyFloodFill, applyFillAll, applyPencil, applyEraser, applyDitherPen,
  applyLine, applyRectangle, applyCircle, getMirroredCoordinates, pickColor,
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
let strokeHasSnapshot = false;
let rightErase = false;
let shape: {
  tool: "line" | "rectangle" | "circle";
  layer: Layer;
  start: { x: number; y: number };
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
  width: packStore.width,
  height: packStore.height,
  layers: packStore.layers,
}));
const canvasWidth = computed(() => viewportSize.value?.width ?? packStore.width * uiScale);
const canvasHeight = computed(() => viewportSize.value?.height ?? packStore.height * uiScale);
const view = computed(() => ({ zoomLevel: zoomLevel.value, panOffset: panOffset.value }));
const transform = computed(() => getCanvasTransform(
  packStore.width, packStore.height, canvasWidth.value, canvasHeight.value, uiScale, view.value,
));
const checkerboardStyle = computed(() => ({
  left: `${Math.round(transform.value.x)}px`,
  top: `${Math.round(transform.value.y)}px`,
  width: `${Math.round(transform.value.x + packStore.width * transform.value.scale) - Math.round(transform.value.x)}px`,
  height: `${Math.round(transform.value.y + packStore.height * transform.value.scale) - Math.round(transform.value.y)}px`,
  backgroundSize: `${transform.value.scale}px ${transform.value.scale}px`,
}));
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

  const state = shape ? {
    ...engineState.value,
    layers: packStore.layers.map((layer) => layer.id === shape?.layer.id
      ? { ...layer, data: shape.preview } : layer),
  } : engineState.value;
  renderCanvas(canvasContext, state, uiScale, packStore.activeLayerIndex, packStore.onionSkinRange, view.value);
}

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
    viewportSize.value = { width: Math.round(bounds.width), height: Math.round(bounds.height) };
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
  zoomLevel.value = 1;
  panOffset.value = { x: 0, y: 0 };
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

function paintPixel(event: MouseEvent) {
  const coordinates = getGridCoordinates(event);

  if (!coordinates) {
    return;
  }

  const layer = packStore.layers[packStore.activeLayerIndex];

  if (!layer) {
    throw new RangeError("The active layer does not exist.");
  }

  if (!layer.visible) {
    return;
  }

  const { x, y } = coordinates;
  const currentColor = pickColor(layer.data, x, y);
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
  if (tool === "dither" && (x + y) % 2 !== 0) {
    return;
  }
  if (isFill ? currentColor === color :
    getMirroredCoordinates(layer.data, x, y, symmetry)
      .every((point) => layer.data[point.y][point.x] === color)) {
    return;
  }

  if (isFill || !strokeHasSnapshot) {
    packStore.saveHistorySnapshot();
    strokeHasSnapshot = true;
  }

  if (tool === "fill-all") {
    applyFillAll(layer.data, x, y, packStore.activeColor);
  } else if (tool === "bucket") {
    applyFloodFill(layer.data, x, y, packStore.activeColor, symmetry);
  } else if (tool === "eraser") {
    applyEraser(layer.data, x, y, symmetry);
  } else if (tool === "dither") {
    applyDitherPen(layer.data, x, y, packStore.activeColor, symmetry);
  } else {
    applyPencil(layer.data, x, y, color, symmetry);
  }

  if (packStore.activeItemId) {
    packStore.markItemEdited(packStore.activeItemId);
  }
}

function updateShape(event: MouseEvent) {
  if (!shape) return;
  const end = getGridCoordinates(event);
  if (!end) return;
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
  redraw();
}

function startDrawing(event: MouseEvent) {
  if (event.button !== 0 && event.button !== 2) {
    return;
  }

  stopDrawing();
  rightErase = event.button === 2;
  if (rightErase) {
    isDrawing.value = true;
    paintPixel(event);
    return;
  }
  const tool = packStore.activeTool;
  if (tool === "line" || tool === "rectangle" || tool === "circle") {
    const start = getGridCoordinates(event);
    const layer = packStore.layers[packStore.activeLayerIndex];
    if (!start || !layer?.visible) return;
    shape = {
      tool, layer, start, original: layer.data.map((row) => [...row]),
      preview: layer.data, color: packStore.activeColor,
      filled: packStore.shapeFilled, symmetry: symmetryOptions(),
    };
    isDrawing.value = true;
    updateShape(event);
    return;
  }
  isDrawing.value = tool === "pencil" || tool === "eraser" || tool === "dither";
  paintPixel(event);
}

function continueDrawing(event: MouseEvent) {
  if (isPanning.value || spaceHeld.value) return;
  if ((event.buttons & (rightErase ? 2 : 1)) === 0) {
    stopDrawing();
    return;
  }
  if (shape) {
    updateShape(event);
    return;
  }
  if (isDrawing.value &&
    (rightErase || packStore.activeTool === "pencil" || packStore.activeTool === "eraser" || packStore.activeTool === "dither")) {
    paintPixel(event);
  }
}

function stopDrawing() {
  if (shape) {
    const { layer, preview, original } = shape;
    shape = null;
    if (layer.visible && packStore.layers[packStore.activeLayerIndex] === layer &&
      preview.some((row, y) => row.some((color, x) => color !== original[y][x]))) {
      packStore.saveHistorySnapshot();
      layer.data = preview;
      if (packStore.activeItemId) packStore.markItemEdited(packStore.activeItemId);
    }
    redraw();
  }
  isDrawing.value = false;
  strokeHasSnapshot = false;
  rightErase = false;
}

function finishDrawing(event: MouseEvent) {
  if (shape) updateShape(event);
  stopDrawing();
}

function cancelDrawing() {
  const hadPreview = shape !== null;
  shape = null;
  isDrawing.value = false;
  strokeHasSnapshot = false;
  rightErase = false;
  if (hadPreview && canvasContext && packStore.activeLayerIndex < packStore.layers.length) {
    redraw();
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
  if (event.key === "Escape" && shape) {
    event.preventDefault();
    cancelDrawing();
    return;
  }
  if (!(event.ctrlKey || event.metaKey) || event.altKey) {
    return;
  }
  const key = event.key.toLowerCase();
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
  shape = null;
});

watch(() => [
  packStore.activeTool, packStore.activeLayerIndex, packStore.activeItemId,
  packStore.pendingItemId, packStore.width, packStore.height, packStore.symmetryHorizontal,
  packStore.symmetryVertical, packStore.shapeFilled,
  packStore.layers[packStore.activeLayerIndex],
  packStore.layers[packStore.activeLayerIndex]?.visible,
], cancelDrawing, { flush: "sync" });

watch(() => [packStore.activeItemId, packStore.categories], () => {
  cancelDrawing();
  stopPan();
  resetView();
});

watch(() => [
  packStore.layers, packStore.activeLayerIndex, packStore.onionSkinRange,
  packStore.width, packStore.height, canvasWidth.value, canvasHeight.value, view.value,
], () => {
  if (canvasContext) {
    redraw();
  }
}, { deep: true, flush: "post" });
</script>

<template>
  <div
    ref="containerRef"
    class="relative h-full min-h-0 w-full min-w-0 overflow-hidden bg-[#292929]"
    aria-label="Zoom and pan canvas"
    @wheel.prevent="wheelZoom"
    @mousedown="startInteraction"
  >
    <div aria-hidden="true" class="alpha-checkerboard pointer-events-none absolute" :style="checkerboardStyle" />
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
    <div
      v-if="hoverStyle"
      aria-hidden="true"
      data-testid="pixel-hover"
      class="pointer-events-none absolute bg-white/25"
      :style="hoverStyle"
    />
    <div class="absolute bottom-3 right-3 flex items-center gap-2 rounded border border-zinc-600 bg-zinc-900/90 p-1 text-xs text-zinc-100" @mousedown.stop @wheel.stop>
      <button type="button" aria-label="Zoom out" class="rounded px-2 py-1 hover:bg-zinc-700" @click="setZoom(zoomLevel / 1.25)">-</button>
      <output aria-label="Zoom level" class="min-w-12 text-center">{{ zoomReadout }}</output>
      <button type="button" aria-label="Zoom in" class="rounded px-2 py-1 hover:bg-zinc-700" @click="setZoom(zoomLevel * 1.25)">+</button>
      <button type="button" class="rounded px-2 py-1 hover:bg-zinc-700" @click="resetView">Reset view</button>
    </div>
  </div>
</template>