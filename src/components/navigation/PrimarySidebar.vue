<script setup lang="ts">
import { ref } from "vue";
import { usePackStore } from "../../stores/packState";
import { buildPackZip, packIconDataUrlToBlob } from "../../engine/exportEngine";
import ResizeModal from "../modals/ResizeModal.vue";
import NewPackModal from "../modals/NewPackModal.vue";
import ImportPackModal from "../modals/ImportPackModal.vue";
import PackIconModal from "../modals/PackIconModal.vue";
import { getSourcePack } from "../../stores/sourcePackStorage";

const store = usePackStore();
const isExporting = ref(false);
const message = ref("");
const exportError = ref("");
const modal = ref<"resize" | "new-pack" | "import-pack" | "pack-icon" | null>(null);

function showSettings() {
  message.value = "Project settings are not available yet.";
}

async function exportPack() {
  if (isExporting.value) return;
  isExporting.value = true;
  exportError.value = "";
  message.value = "";
  try {
    const editedItems = store.getEditedItems();
    const packIcon = store.packIconDataUrl ? packIconDataUrlToBlob(store.packIconDataUrl) : undefined;
    if (store.importedPackId) {
      const sourceArchive = await getSourcePack(store.importedPackId);
      if (packIcon) {
        await buildPackZip(store.packName, editedItems, store.packFormat, store.packDescription, sourceArchive, packIcon);
      } else {
        await buildPackZip(store.packName, editedItems, store.packFormat, store.packDescription, sourceArchive);
      }
    } else if (packIcon) {
      await buildPackZip(store.packName, editedItems, store.packFormat, store.packDescription, undefined, packIcon);
    } else {
      await buildPackZip(store.packName, editedItems, store.packFormat, store.packDescription);
    }
    message.value = "Resource pack download started.";
  } catch (error) {
    exportError.value = error instanceof Error ? error.message : String(error);
  } finally {
    isExporting.value = false;
  }
}
</script>

<template>
  <nav aria-label="Project actions" class="flex h-full w-full min-w-0 flex-col items-center gap-2 border-r border-zinc-600 bg-[#292929] py-3 text-zinc-100">
    <button type="button" aria-label="Create new pack" title="Create new pack" class="rounded p-3 hover:bg-gray-700 focus-visible:outline focus-visible:outline-sky-400" @click="modal = 'new-pack'">
      <svg aria-hidden="true" class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M4 3h10l6 6v12H4Z M14 3v6h6 M8 15h8m-4-4v8" /></svg>
    </button>
    <button type="button" aria-label="Import pack" title="Import pack" class="rounded p-3 hover:bg-gray-700 focus-visible:outline focus-visible:outline-sky-400" @click="modal = 'import-pack'">
      <svg aria-hidden="true" class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
        <path d="M12 16V4m-5 5 5-5 5 5M4 15v5h16v-5" />
      </svg>
    </button>
    <button type="button" aria-label="Settings" title="Settings" class="rounded p-3 hover:bg-gray-700 focus-visible:outline focus-visible:outline-sky-400" @click="showSettings">
      <svg aria-hidden="true" class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
        <circle cx="12" cy="12" r="4" /><path d="M12 2v3m0 14v3M2 12h3m14 0h3M5 5l2 2m10 10 2 2M5 19l2-2M17 7l2-2" />
      </svg>
    </button>
    <button type="button" aria-label="Design resource pack icon" title="Design resource pack icon" class="rounded p-3 hover:bg-gray-700 focus-visible:outline focus-visible:outline-sky-400" @click="modal = 'pack-icon'">
      <svg aria-hidden="true" class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
        <path d="M4 4h16v16H4z M4 15l4-4 4 4 3-3 5 5 M9 8h.01" />
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
  <ResizeModal v-if="modal === 'resize'" @close="modal = null" @resized="message = `Active texture resized to ${store.frameWidth} by ${store.frameHeight}.`" />
  <NewPackModal v-if="modal === 'new-pack'" @close="modal = null" @created="message = 'New pack created.'" />
  <ImportPackModal v-if="modal === 'import-pack'" @close="modal = null" @imported="message = 'Pack imported. Select a texture to edit it.'" />
  <PackIconModal v-if="modal === 'pack-icon'" @close="modal = null" @applied="message = 'Resource pack icon applied.'" />
</template>
