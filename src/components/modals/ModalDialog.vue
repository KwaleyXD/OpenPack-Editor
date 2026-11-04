<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, useId } from "vue";

defineProps<{ title: string; wide?: boolean }>();
const emit = defineEmits<{ close: [] }>();
const dialog = ref<HTMLDialogElement | null>(null);
const titleId = useId();

onMounted(() => dialog.value?.showModal());
onBeforeUnmount(() => dialog.value?.close());
</script>

<template>
  <dialog
    ref="dialog" :aria-labelledby="titleId"
    class="m-auto rounded-lg border border-zinc-600 bg-[#333333] p-5 text-zinc-100 shadow-2xl backdrop:bg-black/60"
    :class="wide ? 'w-[min(90vw,72rem)] max-w-none' : 'w-[min(90vw,28rem)]'"
    @cancel.prevent="emit('close')"
    @keydown.esc.prevent.stop="emit('close')"
  >
    <header class="mb-4 flex items-center justify-between gap-4">
      <h2 :id="titleId" class="text-lg font-semibold">{{ title }}</h2>
      <button type="button" aria-label="Close dialog" class="rounded px-2 py-1 hover:bg-zinc-700" @click="emit('close')">X</button>
    </header>
    <slot />
  </dialog>
</template>
