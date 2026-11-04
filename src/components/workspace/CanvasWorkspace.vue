<script setup lang="ts">
import { onMounted, reactive, ref } from "vue";
import {
  initGrid,
  renderCanvas,
  type EngineState,
} from "../../engine/canvasEngine";
import { usePackStore } from "../../stores/packState";

const uiScale = 32;
const packStore = usePackStore();
const canvasRef = ref<HTMLCanvasElement | null>(null);
const isDrawing = ref(false);

const engineState = reactive<EngineState>({
  width: 16,
  height: 16,
  layers: [
    {
      id: "layer-0",
      name: "Layer 1",
      visible: true,
      data: initGrid(16),
    },
  ],
});

let canvasContext: CanvasRenderingContext2D | null = null;

function redraw() {
  if (!canvasContext) {
    throw new Error("Canvas 2D context is not initialized.");
  }

  renderCanvas(canvasContext, engineState, uiScale);
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

  if (x < 0 || y < 0 || x >= engineState.width || y >= engineState.height) {
    return null;
  }

  return { x, y };
}

function paintPixel(event: MouseEvent) {
  const coordinates = getGridCoordinates(event);

  if (!coordinates) {
    return;
  }

  const layer = engineState.layers[packStore.activeLayerIndex];
  const row = layer?.data[coordinates.y];

  if (!layer || !layer.visible || !row) {
    return;
  }

  row[coordinates.x] = packStore.activeColor;

  if (packStore.activeItemId) {
    packStore.markItemEdited(packStore.activeItemId);
  }

  redraw();
}

function startDrawing(event: MouseEvent) {
  if (event.button !== 0) {
    return;
  }

  isDrawing.value = true;
  paintPixel(event);
}

function continueDrawing(event: MouseEvent) {
  if (isDrawing.value) {
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