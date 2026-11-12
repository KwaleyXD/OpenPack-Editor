<script setup lang="ts">
import { ref } from "vue";
import { importResourcePack } from "../../logic/packImporter";
import ModalDialog from "./ModalDialog.vue";

const emit = defineEmits<{ close: []; imported: [] }>();
const file = ref<File | null>(null);
const confirmed = ref(false);
const importing = ref(false);
const error = ref("");

function selectFile(event: Event) {
  file.value = (event.target as HTMLInputElement).files?.[0] ?? null;
}

function close() {
  if (!importing.value) emit("close");
}

async function importPack() {
  if (importing.value) return;
  if (!file.value) {
    error.value = "Choose a resource pack ZIP file.";
    return;
  }
  if (!confirmed.value) {
    error.value = "Confirm replacement of the current project before importing.";
    return;
  }
  importing.value = true;
  error.value = "";
  try {
    await importResourcePack(file.value);
    emit("imported");
    emit("close");
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : String(cause);
  } finally {
    importing.value = false;
  }
}
</script>

<template>
  <ModalDialog title="Import resource pack" @close="close">
    <form class="space-y-4" @submit.prevent="importPack">
      <label class="block text-sm">
        Resource pack ZIP
        <input
          type="file"
          accept=".zip,application/zip"
          class="mt-1 block w-full text-xs text-zinc-300 file:mr-3 file:rounded file:border-0 file:bg-zinc-700 file:px-3 file:py-2 file:text-zinc-100"
          :disabled="importing"
          @change="selectFile"
        />
      </label>
      <p class="text-xs text-zinc-400">Imports every PNG texture from assets/&lt;namespace&gt;/textures, including animation metadata. Other pack files are kept in the exported ZIP.</p>
      <p class="text-sm text-amber-300">This replaces the current project. Export any work you want to keep first.</p>
      <label class="flex items-start gap-2 text-sm">
        <input v-model="confirmed" type="checkbox" class="mt-1" :disabled="importing" />
        Replace the current project with this pack
      </label>
      <p v-if="error" role="alert" class="break-words text-sm text-red-400">{{ error }}</p>
      <footer class="flex justify-end gap-2">
        <button type="button" class="rounded px-3 py-2 hover:bg-zinc-700" :disabled="importing" @click="emit('close')">Cancel</button>
        <button type="submit" :disabled="importing || !file || !confirmed" class="rounded bg-sky-700 px-3 py-2 hover:bg-sky-600 disabled:opacity-50">{{ importing ? 'Importing...' : 'Import pack' }}</button>
      </footer>
    </form>
  </ModalDialog>
</template>
