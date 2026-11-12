<script setup lang="ts">
import { computed, onBeforeUnmount, ref, toRaw, watch } from "vue";
import { type TextureItem, usePackStore } from "../../stores/packState";
import { getTexturePath } from "../../logic/texturePaths";
import { renderCanvas } from "../../engine/canvasEngine";
import { createFrameScheduler } from "../../engine/frameScheduler";
import { getTextureAnimation } from "../../logic/assetManifest";
import { frameLayers, getFrameRect } from "../../logic/animationLogic";
import { getSourceTextureBlob } from "../../stores/sourcePackStorage";

const props = defineProps<{ item: TextureItem; frameIndex?: number }>();
const store = usePackStore();
const canvas = ref<HTMLCanvasElement | null>(null);
const error = ref("");
const layers = computed(() => props.item.id === store.activeItemId ? store.layers : props.item.savedLayers);
const animation = computed(() => getTextureAnimation(
  props.item.filePath,
  layers.value?.[0]?.data[0]?.length,
  layers.value?.[0]?.data.length,
  store.importedPackId ? props.item.metadata ?? null : undefined,
  props.item.sourceWidth,
  props.item.sourceHeight,
));
const selectedFrame = computed(() => props.frameIndex ?? (props.item.id === store.activeItemId ? store.activeFrameIndex : 0));
const rect = computed(() => animation.value ? getFrameRect(animation.value, selectedFrame.value) : null);
const imageStyle = computed(() => {
  if (!rect.value || !animation.value) return undefined;
  const size = 26;
  const scale = size / Math.max(rect.value.width, rect.value.height);
  return {
    position: "absolute" as const,
    maxWidth: "none", maxHeight: "none",
    width: `${animation.value.columns * rect.value.width * scale}px`,
    height: `${animation.value.rows * rect.value.height * scale}px`,
    left: `${(size - rect.value.width * scale) / 2 - rect.value.x * scale}px`,
    top: `${(size - rect.value.height * scale) / 2 - rect.value.y * scale}px`,
  };
});
const source = ref("");
watch([() => store.importedPackId, () => props.item.filePath], async ([packId], _previous, onCleanup) => {
  let cancelled = false;
  let objectUrl = "";
  error.value = "";
  onCleanup(() => {
    cancelled = true;
    if (objectUrl) URL.revokeObjectURL(objectUrl);
  });
  const { categoryPath, id } = getTexturePath(props.item.filePath);
  source.value = packId ? "" : `/vanilla_base/${categoryPath}/${id}.png`;
  if (!packId) return;
  try {
    const blob = await getSourceTextureBlob(packId, props.item.filePath);
    if (!cancelled) {
      objectUrl = URL.createObjectURL(blob);
      source.value = objectUrl;
    }
  } catch (cause) {
    if (!cancelled) error.value = cause instanceof Error ? cause.message : String(cause);
  }
}, { immediate: true });
const frame = createFrameScheduler(() => {
  if (!canvas.value || !layers.value) return;
  const context = canvas.value.getContext("2d");
  if (!context) {
    error.value = `Unable to render preview: ${props.item.name}`;
    return;
  }
  const width = rect.value?.width ?? layers.value[0]?.data[0]?.length ?? 1;
  const height = rect.value?.height ?? layers.value[0]?.data.length ?? 1;
  const scale = 28 / Math.max(width, height);
  canvas.value.width = Math.max(1, Math.round(width * scale));
  canvas.value.height = Math.max(1, Math.round(height * scale));
  const displayedLayers = rect.value ? frameLayers(toRaw(layers.value), rect.value) : toRaw(layers.value);
  renderCanvas(context, { width, height, layers: displayedLayers }, scale, 0, 0,
    undefined, { showGrid: false });
  error.value = "";
});
watch([layers, selectedFrame, () => props.item.id === store.activeItemId ? store.renderRevision : 0], () => {
  error.value = "";
  frame.request();
}, { flush: "post" });
watch(() => props.item.savedLayers, () => frame.request(), { deep: true, flush: "post" });
watch(canvas, () => { if (canvas.value) frame.request(); }, { flush: "post" });
onBeforeUnmount(() => {
  frame.cancel();
});
</script>

<template>
  <span class="alpha-checkerboard relative flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-sm border border-white/10">
    <span v-if="error" role="img" :aria-label="error" :title="error" class="text-red-400">!</span>
    <canvas v-else-if="layers" ref="canvas" role="img" :aria-label="`Preview of ${item.name}`" class="max-h-full max-w-full" />
    <img v-else-if="source" :src="source" :alt="`Preview of ${item.name}`" loading="lazy" decoding="async"
      class="h-full w-full object-contain [image-rendering:pixelated]" :style="imageStyle"
      @error="error = `Unable to load preview: ${item.name}`" />
    <span v-else class="text-[9px] text-zinc-500">...</span>
  </span>
</template>
