<script setup lang="ts">
import { ref } from "vue";
import { usePackStore } from "../../stores/packState";

const packStore = usePackStore();
const expandedCategoryIds = ref(new Set<string>());

function toggleCategory(categoryId: string) {
  const expandedIds = new Set(expandedCategoryIds.value);

  if (expandedIds.has(categoryId)) {
    expandedIds.delete(categoryId);
  } else {
    expandedIds.add(categoryId);
  }

  expandedCategoryIds.value = expandedIds;
}

async function selectTexture(itemId: string) {
  try {
    await packStore.selectItem(itemId);
  } catch {
    // The store exposes the load failure in the alert below.
  }
}
</script>

<template>
  <section class="flex h-full min-h-0 flex-col text-zinc-100">
    <h2 class="sr-only">Texture assets</h2>
    <p v-if="packStore.pendingItemId" role="status" class="p-2 text-xs text-zinc-400">
      Loading texture...
    </p>
    <p v-if="packStore.selectionError" role="alert" class="break-words p-2 text-xs text-red-400">
      {{ packStore.selectionError }}
    </p>

    <div
      v-if="packStore.categories.length === 0"
      class="p-3 text-xs text-zinc-400"
    >
      No textures loaded
    </div>

    <div
      v-for="category in packStore.categories"
      :key="category.id"
      class="border-b border-zinc-600/80"
    >
      <button
        type="button"
        class="flex w-full items-center gap-2 px-2 py-2 text-left transition-colors hover:bg-white/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-inset focus-visible:outline-sky-400"
        :aria-expanded="expandedCategoryIds.has(category.id)"
        @click="toggleCategory(category.id)"
      >
        <svg
          aria-hidden="true"
          class="h-3 w-3 shrink-0 text-zinc-400 transition-transform"
          :class="{ 'rotate-90': expandedCategoryIds.has(category.id) }"
          viewBox="0 0 16 16"
          fill="currentColor"
        >
          <path d="m5 3 5 5-5 5V3Z" />
        </svg>

        <span class="min-w-0 flex-1 truncate text-xs font-medium">
          {{ category.name }}
        </span>

        <span
          class="shrink-0 text-[10px] tabular-nums"
          :style="{ color: packStore.categoryProgress(category.id).color }"
        >
          {{ packStore.categoryProgress(category.id).formatted }}
        </span>
      </button>

      <div class="h-1 bg-zinc-700">
        <div
          class="h-full transition-[width] duration-200"
          :style="{
            width: `${
              packStore.categoryProgress(category.id).total === 0
                ? 0
                : (packStore.categoryProgress(category.id).completed /
                    packStore.categoryProgress(category.id).total) *
                  100
            }%`,
            backgroundColor: packStore.categoryProgress(category.id).color,
          }"
        />
      </div>

      <ul
        v-if="expandedCategoryIds.has(category.id)"
        class="space-y-0.5 p-1"
      >
        <li v-for="item in category.items" :key="item.id">
          <button
            type="button"
            class="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs transition-colors hover:bg-white/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-400"
            :class="
              packStore.activeItemId === item.id
                ? 'bg-sky-500/20 text-sky-100'
                : 'text-zinc-300'
            "
            :aria-current="
              packStore.activeItemId === item.id ? 'true' : undefined
            "
            :title="item.filePath"
            :aria-busy="packStore.pendingItemId === item.id"
            @click="selectTexture(item.id)"
          >
            <span
              aria-hidden="true"
              class="h-7 w-7 shrink-0 rounded-sm border border-white/10 bg-[#292929]"
            />
            <span class="min-w-0 flex-1 truncate">{{ item.name }}</span>
            <svg
              v-if="item.edited"
              aria-label="Edited"
              class="h-3.5 w-3.5 shrink-0 text-green-400"
              viewBox="0 0 16 16"
              fill="none"
            >
              <path
                d="m3 8 3.2 3.2L13 4.5"
                stroke="currentColor"
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
              />
            </svg>
          </button>
        </li>
      </ul>
    </div>
  </section>
</template>