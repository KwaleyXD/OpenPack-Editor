<script setup lang="ts">
import { ref } from "vue";
import { usePackStore } from "../../stores/packState";
import { buildPackZip } from "../../engine/exportEngine";
import ResizeModal from "../modals/ResizeModal.vue";
import NewPackModal from "../modals/NewPackModal.vue";

const store = usePackStore();
const isExporting = ref(false);
const message = ref("");
const exportError = ref("");
const modal = ref<"resize" | "new-pack" | null>(null);

function showSettings() {
  message.value = "Project settings are not available yet.";
}

async function exportPack() {
  if (isExporting.value) return;
  isExporting.value = true;
  exportError.value = "";
  message.value = "";
  try {
    await buildPackZip(store.packName, store.getEditedItems(), store.packFormat, store.packDescription);
    message.value = "Resource pack download started.";
  } catch (error) {
    exportError.value = error instanceof Error ? error.message : String(error);
  } finally {
    isExporting.value = false;
  }
}
</script>

<template>
  <nav aria-label="Project actions" class="flex h-full w-16 flex-col items-center gap-2 border-r border-zinc-600 bg-[#292929] py-3 text-zinc-100">
    <button type="button" aria-label="Create new pack" title="Create new pack" class="rounded p-3 hover:bg-gray-700 focus-visible:outline focus-visible:outline-sky-400" @click="modal = 'new-pack'">
      <svg aria-hidden="true" class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M4 3h10l6 6v12H4Z M14 3v6h6 M8 15h8m-4-4v8" /></svg>
    </button>
    <button type="button" aria-label="Settings" title="Settings" class="rounded p-3 hover:bg-gray-700 focus-visible:outline focus-visible:outline-sky-400" @click="showSettings">
      <svg aria-hidden="true" class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
        <circle cx="12" cy="12" r="4" /><path d="M12 2v3m0 14v3M2 12h3m14 0h3M5 5l2 2m10 10 2 2M5 19l2-2M17 7l2-2" />
      </svg>
    </button>
    <button type="button" aria-label="Resize canvas" title="Resize canvas" class="rounded p-3 hover:bg-gray-700 focus-visible:outline focus-visible:outline-sky-400" @click="modal = 'resize'">
      <svg aria-hidden="true" class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
        <path d="M3 9V3h6m6 0h6v6M3 15v6h6m6 0h6v-6M3 3l6 6m12-6-6 6M3 21l6-6m12 6-6-6" />
      </svg>
    </button>
    <button type="button" aria-label="Export Pack" :title="isExporting ? 'Exporting...' : 'Export Pack'" :disabled="isExporting" :aria-busy="isExporting" class="rounded p-3 hover:bg-gray-700 focus-visible:outline focus-visible:outline-sky-400 disabled:opacity-50" @click="exportPack">
      <svg aria-hidden="true" class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
        <path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5" />
      </svg>
    </button>
    <p v-if="message" role="status" class="break-words px-1 text-center text-[10px] text-zinc-300">{{ message }}</p>
    <p v-if="exportError" role="alert" class="break-words px-1 text-center text-[10px] text-red-400">{{ exportError }}</p>
  </nav>
  <ResizeModal v-if="modal === 'resize'" @close="modal = null" @resized="message = `Active texture resized to ${store.width} by ${store.height}.`" />
  <NewPackModal v-if="modal === 'new-pack'" @close="modal = null" @created="message = 'New pack created.'" />
</template>