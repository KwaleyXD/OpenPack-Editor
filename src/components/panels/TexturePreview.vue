<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { usePackStore } from "../../stores/packState";
import { renderCanvas } from "../../engine/canvasEngine";

const props = withDefaults(defineProps<{ expanded?: boolean }>(), { expanded: false });
const store = usePackStore();
const canvas = ref<HTMLCanvasElement | null>(null);
const error = ref("");
const dimensions = computed(() => {
  const scale = (props.expanded ? 1024 : 256) / Math.max(store.width, store.height);
  return {
    width: Math.max(1, Math.round(store.width * scale)),
    height: Math.max(1, Math.round(store.height * scale)),
  };
});
let context: CanvasRenderingContext2D | null = null;

function redraw() {
  if (!context) return;
  renderCanvas(
    context,
    { width: store.width, height: store.height, layers: store.layers },
    Math.min(dimensions.value.width / store.width, dimensions.value.height / store.height),
    store.activeLayerIndex, store.onionSkinRange,
    undefined, { showGrid: false },
  );
}

onMounted(() => {
  context = canvas.value?.getContext("2d") ?? null;
  if (!context) {
    error.value = "Unable to initialize the minimap 2D context.";
    return;
  }
  redraw();
});

watch(
  () => [store.layers, store.width, store.height, store.activeLayerIndex, store.onionSkinRange, props.expanded],
  redraw,
  { deep: true, flush: "post" },
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
      ? { width: `min(100%, ${70 * store.width / store.height}dvh)`, height: 'auto' }
      : { maxWidth: `${256 * store.width / store.height}px` }"
  />
  <p v-if="error" role="alert" class="text-xs text-red-400">{{ error }}</p>
</template>
