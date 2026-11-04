<script setup lang="ts">
import { ref } from "vue";
import { createNewPack } from "../../logic/packInitializer";
import ModalDialog from "./ModalDialog.vue";

const emit = defineEmits<{ close: []; created: [] }>();
const name = ref("My Custom Pack");
const description = ref("Made in OpenPack Editor");
const confirmed = ref(false);
const creating = ref(false);
const error = ref("");

async function create() {
  if (creating.value) return;
  if (!confirmed.value) {
    error.value = "Confirm replacement of the current project before creating a new pack.";
    return;
  }
  creating.value = true;
  error.value = "";
  try {
    await createNewPack(name.value, description.value);
    emit("created");
    emit("close");
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : String(cause);
  } finally {
    creating.value = false;
  }
}
</script>

<template>
  <ModalDialog title="Create new pack" @close="emit('close')">
    <form class="space-y-4" @submit.prevent="create">
      <label class="block text-sm">
        Pack name
        <input v-model="name" required autofocus class="mt-1 w-full rounded border border-zinc-600 bg-zinc-800 p-2" />
      </label>
      <label class="block text-sm">
        Description
        <textarea v-model="description" rows="3" class="mt-1 w-full rounded border border-zinc-600 bg-zinc-800 p-2" />
      </label>
      <p class="text-xs text-zinc-400">Includes the supplied default texture library. Select an asset to load its original pixels at native resolution. Animated textures open as full sprite sheets. Export uses legacy pack format 34.</p>
      <p class="text-sm text-amber-300">This replaces the current project and its local save. Export any work you want to keep first. Custom palettes are preserved.</p>
      <label class="flex items-start gap-2 text-sm">
        <input v-model="confirmed" type="checkbox" required class="mt-1" />
        Replace the current project and its local save
      </label>
      <p v-if="error" role="alert" class="text-sm text-red-400">{{ error }}</p>
      <footer class="flex justify-end gap-2">
        <button type="button" class="rounded px-3 py-2 hover:bg-zinc-700" @click="emit('close')">Cancel</button>
        <button type="submit" :disabled="creating || !confirmed" class="rounded bg-sky-700 px-3 py-2 hover:bg-sky-600 disabled:opacity-50">{{ creating ? 'Creating...' : 'Create pack' }}</button>
      </footer>
    </form>
  </ModalDialog>
</template>
