<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { usePackStore } from "../../stores/packState";
import { getSourcePackZip } from "../../stores/sourcePackStorage";
import ModalDialog from "./ModalDialog.vue";

const emit = defineEmits<{ close: []; applied: [] }>();
const store = usePackStore();
const sourceUrl = ref("");
const sourceImage = ref<HTMLImageElement | null>(null);
const error = ref("");
const brightness = ref(100);
const contrast = ref(100);
const saturation = ref(100);
const hue = ref(0);
const grayscale = ref(0);
const filters = computed(() =>
  `brightness(${brightness.value}%) contrast(${contrast.value}%) ` +
  `saturate(${saturation.value}%) hue-rotate(${hue.value}deg) grayscale(${grayscale.value}%)`,
);
let ownedObjectUrl: string | null = null;
let imageLoadId = 0;

async function loadImage(url: string, requestId: number): Promise<boolean> {
  const image = new Image();
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error("Unable to load this image."));
    image.src = url;
  });
  if (!image.naturalWidth || !image.naturalHeight) throw new Error("The selected image has no pixels.");
  if (requestId !== imageLoadId) return false;
  sourceImage.value = image;
  sourceUrl.value = url;
  return true;
}

onMounted(async () => {
  const requestId = ++imageLoadId;
  try {
    if (store.packIconDataUrl) {
      await loadImage(store.packIconDataUrl, requestId);
    } else if (store.importedPackId) {
      const archive = await getSourcePackZip(store.importedPackId);
      if (requestId !== imageLoadId) return;
      const icon = archive.file("pack.png");
      if (icon) {
        const iconData = await icon.async("arraybuffer");
        if (requestId !== imageLoadId) return;
        ownedObjectUrl = URL.createObjectURL(new Blob([iconData], { type: "image/png" }));
        await loadImage(ownedObjectUrl, requestId);
      }
    }
  } catch (cause) {
    if (requestId === imageLoadId) error.value = cause instanceof Error ? cause.message : String(cause);
  }
});

onBeforeUnmount(() => {
  imageLoadId += 1;
  if (ownedObjectUrl) URL.revokeObjectURL(ownedObjectUrl);
});

async function chooseImage(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0];
  if (!file) return;
  error.value = "";
  if (!["image/png", "image/jpeg", "image/webp"].includes(file.type) &&
    !/\.(?:png|jpe?g|webp)$/i.test(file.name)) {
    error.value = "Choose a PNG, JPEG, or WebP image.";
    return;
  }
  if (file.size > 10 * 1024 * 1024) {
    error.value = "Choose an image smaller than 10 MB.";
    return;
  }
  const requestId = ++imageLoadId;
  const url = URL.createObjectURL(file);
  try {
    if (!await loadImage(url, requestId)) {
      URL.revokeObjectURL(url);
      return;
    }
    if (ownedObjectUrl) URL.revokeObjectURL(ownedObjectUrl);
    ownedObjectUrl = url;
  } catch (cause) {
    URL.revokeObjectURL(url);
    if (requestId === imageLoadId) error.value = cause instanceof Error ? cause.message : String(cause);
  }
}

function applyIcon() {
  error.value = "";
  if (!sourceImage.value) {
    error.value = "Choose an image before applying the icon.";
    return;
  }
  try {
    const canvas = document.createElement("canvas");
    canvas.width = 64;
    canvas.height = 64;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Unable to initialize the icon editor canvas.");
    const image = sourceImage.value;
    const cropSize = Math.min(image.naturalWidth, image.naturalHeight);
    const cropX = (image.naturalWidth - cropSize) / 2;
    const cropY = (image.naturalHeight - cropSize) / 2;
    context.filter = filters.value;
    context.drawImage(image, cropX, cropY, cropSize, cropSize, 0, 0, 64, 64);
    store.packIconDataUrl = canvas.toDataURL("image/png");
    emit("applied");
    emit("close");
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : String(cause);
  }
}
</script>

<template>
  <ModalDialog title="Resource pack icon" @close="emit('close')">
    <div class="space-y-4">
      <label class="block text-sm">
        Choose an image
        <input
          type="file"
          accept="image/png,image/jpeg,image/webp"
          aria-label="Choose icon image"
          class="mt-1 block w-full text-xs text-zinc-300 file:mr-2 file:rounded file:border-0 file:bg-zinc-700 file:px-3 file:py-2 file:text-zinc-100"
          @change="chooseImage"
        />
      </label>
      <div class="flex min-h-32 items-center justify-center rounded border border-zinc-600 bg-[linear-gradient(45deg,#444_25%,transparent_25%),linear-gradient(-45deg,#444_25%,transparent_25%),linear-gradient(45deg,transparent_75%,#444_75%),linear-gradient(-45deg,transparent_75%,#444_75%)] bg-[length:16px_16px] bg-[position:0_0,0_8px,8px_-8px,-8px_0]">
        <img
          v-if="sourceUrl"
          :src="sourceUrl"
          alt="Resource pack icon preview"
          class="h-32 w-32 object-cover [image-rendering:pixelated]"
          :style="{ filter: filters }"
        />
        <p v-else class="px-4 text-center text-xs text-zinc-400">Choose an image to preview your 64 x 64 icon.</p>
      </div>
      <fieldset class="space-y-2">
        <legend class="sr-only">Icon filters</legend>
        <label class="block text-xs">
          Brightness: {{ brightness }}%
          <input v-model.number="brightness" aria-label="Icon brightness" type="range" min="0" max="200" class="block w-full accent-sky-400" />
        </label>
        <label class="block text-xs">
          Contrast: {{ contrast }}%
          <input v-model.number="contrast" aria-label="Icon contrast" type="range" min="0" max="200" class="block w-full accent-sky-400" />
        </label>
        <label class="block text-xs">
          Saturation: {{ saturation }}%
          <input v-model.number="saturation" aria-label="Icon saturation" type="range" min="0" max="200" class="block w-full accent-sky-400" />
        </label>
        <label class="block text-xs">
          Hue: {{ hue }}°
          <input v-model.number="hue" aria-label="Icon hue" type="range" min="0" max="360" class="block w-full accent-sky-400" />
        </label>
        <label class="block text-xs">
          Grayscale: {{ grayscale }}%
          <input v-model.number="grayscale" aria-label="Icon grayscale" type="range" min="0" max="100" class="block w-full accent-sky-400" />
        </label>
      </fieldset>
      <p v-if="error" role="alert" class="text-sm text-red-400">{{ error }}</p>
      <footer class="flex justify-between gap-2">
        <button
          type="button"
          class="rounded px-3 py-2 text-sm hover:bg-zinc-700"
          @click="brightness = 100; contrast = 100; saturation = 100; hue = 0; grayscale = 0"
        >Reset filters</button>
        <button
          type="button"
          class="rounded bg-sky-700 px-3 py-2 text-sm hover:bg-sky-600"
          @click="applyIcon"
        >Apply icon</button>
      </footer>
    </div>
  </ModalDialog>
</template>
