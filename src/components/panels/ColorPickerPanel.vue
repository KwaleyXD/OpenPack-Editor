<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { usePackStore } from "../../stores/packState";
import { PALETTE_PRESETS, hexToRgba } from "../../logic/colorLogic";
import { rgbaToHex } from "../../engine/imageLoader";

const store = usePackStore();
const selectedPalette = ref("earth");
const paletteName = ref("");
const hexInput = ref(store.activeColor);
const inputError = ref("");
const palettes = computed(() => [...PALETTE_PRESETS, ...store.customPalettes]);
const palette = computed(() => palettes.value.find(({ id }) => id === selectedPalette.value) ?? PALETTE_PRESETS[0]);
const channels = computed(() => hexToRgba(store.activeColor));
const channelFields = [
  { key: "r", label: "Red" }, { key: "g", label: "Green" },
  { key: "b", label: "Blue" }, { key: "a", label: "Alpha" },
] as const;

watch(() => store.activeColor, (color) => {
  hexInput.value = color;
  inputError.value = "";
});

function commitHex() {
  try {
    store.setActiveColor(hexInput.value);
    hexInput.value = store.activeColor;
    inputError.value = "";
  } catch (error) {
    inputError.value = error instanceof Error ? error.message : String(error);
  }
}

function setChannel(channel: "r" | "g" | "b" | "a", event: Event) {
  if (!(event.target instanceof HTMLInputElement)) return;
  const value = event.target.valueAsNumber;
  if (!Number.isInteger(value) || value < 0 || value > 255) {
    inputError.value = "RGBA channels must be integers from 0 to 255.";
    return;
  }
  const next = { ...channels.value, [channel]: value };
  store.setActiveColor(rgbaToHex(next.r, next.g, next.b, next.a));
  inputError.value = "";
}

function setNativeColor(event: Event) {
  if (!(event.target instanceof HTMLInputElement)) return;
  const { r, g, b } = hexToRgba(event.target.value);
  store.setActiveColor(rgbaToHex(r, g, b, channels.value.a));
}

function savePalette() {
  const colors = [store.activeColor, ...store.recentColors];
  if (store.saveCustomPalette(paletteName.value, colors)) {
    selectedPalette.value = store.customPalettes[store.customPalettes.length - 1].id;
    paletteName.value = "";
  }
}
</script>

<template>
  <section aria-label="Color palette" class="space-y-3">
    <h2 class="text-xs font-semibold">Colors</h2>
    <label class="block text-xs">
      Palette preset
      <select v-model="selectedPalette" class="mt-1 w-full rounded border border-zinc-600 bg-zinc-800 p-1 text-xs">
        <option v-for="preset in palettes" :key="preset.id" :value="preset.id">{{ preset.name }}</option>
      </select>
    </label>
    <div class="flex flex-wrap gap-1">
      <button
        v-for="color in palette.colors" :key="color" type="button"
        :aria-label="`Select color ${color}`" :title="color"
        :aria-pressed="store.activeColor === color"
        class="h-6 w-6 rounded-sm border-2 focus-visible:outline focus-visible:outline-sky-400"
        :class="store.activeColor === color ? 'border-sky-400' : 'border-zinc-600'"
        :style="{ backgroundColor: color }"
        @click="store.setActiveColor(color)"
      />
    </div>
    <div aria-label="Recent colors">
      <h3 class="mb-1 text-xs text-zinc-400">Recent colors</h3>
      <div class="flex flex-wrap gap-1">
        <button
          v-for="color in store.recentColors" :key="color" type="button"
          :aria-label="`Recent color ${color}`" :title="color"
          :aria-pressed="store.activeColor === color"
          class="h-5 w-5 rounded-sm border border-zinc-500"
          :style="{ backgroundColor: color }"
          @click="store.setActiveColor(color)"
        />
      </div>
    </div>
    <label class="flex items-center justify-between gap-1 text-xs">
      Custom color
      <input :value="store.activeColor.slice(0, 7)" type="color" class="h-7 w-10 cursor-pointer bg-transparent" @input="setNativeColor" @change="setNativeColor" />
    </label>
    <label class="block text-xs">
      Hex (RGB / RGBA)
      <input
        v-model="hexInput" type="text" spellcheck="false"
        :aria-invalid="!!inputError" aria-describedby="color-input-error"
        class="mt-1 w-full rounded border border-zinc-600 bg-zinc-800 p-1 font-mono text-xs"
        @change="commitHex" @keydown.enter.prevent="commitHex"
      />
    </label>
    <div class="grid grid-cols-2 gap-1">
      <label v-for="field in channelFields" :key="field.key" class="text-xs">
        {{ field.label }}
        <input
          :value="channels[field.key]" type="number" min="0" max="255" step="1"
          class="w-full rounded border border-zinc-600 bg-zinc-800 p-1"
          @change="setChannel(field.key, $event)"
        />
      </label>
    </div>
    <p v-if="inputError" id="color-input-error" role="alert" class="text-xs text-red-400">{{ inputError }}</p>
    <form class="space-y-1" @submit.prevent="savePalette">
      <label class="block text-xs">
        Custom palette name
        <input v-model="paletteName" class="mt-1 w-full rounded border border-zinc-600 bg-zinc-800 p-1" maxlength="80" />
      </label>
      <button type="submit" class="w-full rounded border border-zinc-600 p-1 text-xs hover:bg-zinc-700">Save recent colors as palette</button>
    </form>
    <p v-if="store.paletteError" role="alert" class="text-xs text-red-400">{{ store.paletteError }}</p>
  </section>
</template>
