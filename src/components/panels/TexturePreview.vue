<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { usePackStore } from "../../stores/packState";
import { renderCanvas } from "../../engine/canvasEngine";
import { createFrameScheduler } from "../../engine/frameScheduler";

const props = withDefaults(defineProps<{ expanded?: boolean }>(), { expanded: false });
const store = usePackStore();
const canvas = ref<HTMLCanvasElement | null>(null);
const error = ref("");
const dimensions = computed(() => {
  const scale = (props.expanded ? 1024 : 256) / Math.max(store.frameWidth, store.frameHeight);
  return {
    width: Math.max(1, Math.round(store.frameWidth * scale)),
    height: Math.max(1, Math.round(store.frameHeight * scale)),
  };
});
let context: CanvasRenderingContext2D | null = null;

function redraw() {
  if (!context) return;
  renderCanvas(
    context,
    { width: store.frameWidth, height: store.frameHeight, layers: store.frameLayers },
    Math.min(dimensions.value.width / store.frameWidth, dimensions.value.height / store.frameHeight),
    store.activeLayerIndex, store.onionSkinRange,
    undefined, { showGrid: false },
  );
}
const frame = createFrameScheduler(redraw);
onBeforeUnmount(frame.cancel);

onMounted(() => {
  context = canvas.value?.getContext("2d") ?? null;
  if (!context) {
    error.value = "Unable to initialize the minimap 2D context.";
    return;
  }
  redraw();
});

watch(
  () => [store.renderRevision, store.width, store.height, store.activeFrameIndex, store.activeLayerIndex, store.onionSkinRange, props.expanded],
  () => frame.request(),
  { flush: "post" },
);
</script>

<template>
  <canvas
    ref="canvas"
    :width="dimensions.width" :height="dimensions.height"
    role="img" :aria-label="expanded ? 'Expanded texture preview' : 'Texture minimap'"
    class="alpha-checkerboard block"
    :class="expanded ? 'mx-auto max-h-[70dvh] max-w-full object-contain' : 'mx-auto h-auto w-full'"
    :style="expanded
      ? { width: `min(100%, ${70 * store.frameWidth / store.frameHeight}dvh)`, height: 'auto' }
      : { maxWidth: `${256 * store.frameWidth / store.frameHeight}px` }"
  />
  <p v-if="error" role="alert" class="text-xs text-red-400">{{ error }}</p>
</template>
