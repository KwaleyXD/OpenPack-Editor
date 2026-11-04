<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import {
  renderCanvas,
  type EngineState,
} from "../../engine/canvasEngine";
import { usePackStore } from "../../stores/packState";
import { applyFloodFill, applyPencil, pickColor } from "../../logic/toolLogic";

const uiScale = 32;
const packStore = usePackStore();
const canvasRef = ref<HTMLCanvasElement | null>(null);
const isDrawing = ref(false);

const engineState = computed<EngineState>(() => ({
  width: 16,
  height: 16,
  layers: packStore.layers,
}));

let canvasContext: CanvasRenderingContext2D | null = null;

function redraw() {
  if (!canvasContext) {
    throw new Error("Canvas 2D context is not initialized.");
  }

  renderCanvas(canvasContext, engineState.value, uiScale);
}

function getGridCoordinates(
  event: MouseEvent,
): { x: number; y: number } | null {
  const canvas = canvasRef.value;

  if (!canvas) {
    return null;
  }

  const bounds = canvas.getBoundingClientRect();
  const x = Math.floor((event.clientX - bounds.left) / uiScale);
  const y = Math.floor((event.clientY - bounds.top) / uiScale);

  if (x < 0 || y < 0 || x >= engineState.value.width || y >= engineState.value.height) {
    return null;
  }

  return { x, y };
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

  if (packStore.activeTool === "eyedropper") {
    if (currentColor !== null) {
      packStore.activeColor = currentColor;
    }
    return;
  }

  const color = packStore.activeTool === "eraser" ? null : packStore.activeColor;
  if (currentColor === color) {
    return;
  }

  if (packStore.activeTool === "bucket") {
    applyFloodFill(layer.data, x, y, packStore.activeColor);
  } else {
    applyPencil(layer.data, x, y, color);
  }

  if (packStore.activeItemId) {
    packStore.markItemEdited(packStore.activeItemId);
  }

}

function startDrawing(event: MouseEvent) {
  if (event.button !== 0) {
    return;
  }

  isDrawing.value = true;
  paintPixel(event);
}

function continueDrawing(event: MouseEvent) {
  if ((event.buttons & 1) === 0) {
    stopDrawing();
    return;
  }
  if (isDrawing.value &&
    (packStore.activeTool === "pencil" || packStore.activeTool === "eraser")) {
    paintPixel(event);
  }
}

function stopDrawing() {
  isDrawing.value = false;
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
});

watch(() => packStore.layers, () => {
  if (canvasContext) {
    redraw();
  }
}, { deep: true });
</script>

<template>
  <div
    class="flex min-h-full min-w-full items-center justify-center overflow-auto bg-[#292929] p-6"
  >
    <canvas
      ref="canvasRef"
      :width="engineState.width * uiScale"
      :height="engineState.height * uiScale"
      class="block shrink-0 cursor-crosshair bg-[#242424] shadow-xl"
      aria-label="16 by 16 pixel texture editor"
      role="img"
      @mousedown="startDrawing"
      @mousemove="continueDrawing"
      @mouseup="stopDrawing"
      @mouseleave="stopDrawing"
    />
  </div>
</template>