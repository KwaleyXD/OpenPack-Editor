<script setup lang="ts">
import { computed, ref } from "vue";
import { usePackStore, type TextureItem } from "../../stores/packState";
import AssetThumbnail from "./AssetThumbnail.vue";
import { getTextureAnimation } from "../../logic/assetManifest";
import { groupNumberedTextures, type NumberedTextureGroup } from "../../logic/numberedTextureGroups";

const packStore = usePackStore();
const searchQuery = ref("");
const filteredCategories = computed(() => {
  const query = searchQuery.value.trim().toLowerCase();
  return packStore.categories
    .map((category) => {
      const groups = groupNumberedTextures(category.items);
      const byId = new Map(groups.flatMap((group) => group.frames.map((frame) => [frame.id, group] as const)));
      const seen = new Set<string>();
      const rows = category.items.flatMap<{ item: TextureItem; group: NumberedTextureGroup<TextureItem> | null }>((item) => {
        const group = byId.get(item.id);
        if (group) {
          if (seen.has(group.name)) return [];
          seen.add(group.name);
          if (query && !group.name.includes(query) && !group.frames.some((frame) =>
            frame.name.toLowerCase().includes(query) || frame.filePath.toLowerCase().includes(query))) return [];
          return [{ item: group.frames[0], group }];
        }
        if (query && !item.name.toLowerCase().includes(query) && !item.filePath.toLowerCase().includes(query)) return [];
        return [{ item, group: null }];
      });
      return { ...category, rows };
    })
    .filter((category) => category.rows.length > 0);
});
const expandedCategoryIds = ref(new Set<string>());
const expandedAnimationIds = ref(new Set<string>());
const animations = computed(() => new Map(packStore.categories.flatMap(({ items }) =>
  items.map((item) => [item.id, getTextureAnimation(
    item.filePath, undefined, undefined,
    packStore.importedPackId ? item.metadata ?? null : undefined,
    item.sourceWidth, item.sourceHeight,
  )] as const))));

function toggleAnimation(itemId: string) {
  const expanded = new Set(expandedAnimationIds.value);
  if (expanded.has(itemId)) expanded.delete(itemId);
  else expanded.add(itemId);
  expandedAnimationIds.value = expanded;
}

async function selectFrame(itemId: string, index: number) {
  await selectTexture(itemId);
  if (packStore.activeItemId === itemId && !packStore.pendingItemId) packStore.selectFrame(index);
}

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
    <div class="flex shrink-0 items-center gap-1 border-b border-zinc-600/80 p-2">
      <label class="min-w-0 flex-1">
        <span class="sr-only">Search textures</span>
        <input
          v-model="searchQuery"
          type="search"
          placeholder="Search textures..."
          class="w-full rounded border border-zinc-600 bg-zinc-800 px-2 py-1.5 text-xs text-zinc-100 placeholder:text-zinc-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-400"
        />
      </label>
      <button
        v-if="searchQuery"
        type="button"
        aria-label="Clear texture search"
        class="shrink-0 rounded px-2 py-1.5 text-xs text-zinc-300 hover:bg-white/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-400"
        @click="searchQuery = ''"
      >
        Clear
      </button>
    </div>
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
    <p
      v-else-if="filteredCategories.length === 0"
      role="status"
      class="p-3 text-xs text-zinc-400"
    >
      No textures match your search
    </p>

    <div
      v-for="category in filteredCategories"
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
        <li v-for="{ item, group } in category.rows" :key="item.id">
          <div class="flex items-center">
            <button v-if="group || animations.get(item.id)" type="button"
              :aria-label="`Expand frames of ${group?.name ?? item.name}`" :aria-expanded="expandedAnimationIds.has(item.id)"
              class="shrink-0 rounded px-1 py-2 text-xs hover:bg-white/10 focus-visible:outline focus-visible:outline-sky-400"
              @click="toggleAnimation(item.id)">{{ expandedAnimationIds.has(item.id) ? '-' : '+' }}</button>
            <button
              type="button"
              class="flex min-w-0 flex-1 items-center gap-2 rounded px-2 py-1.5 text-left text-xs transition-colors hover:bg-white/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-400"
              :class="
                (group ? group.frames.some((frame) => frame.id === packStore.activeItemId) : packStore.activeItemId === item.id)
                  ? 'bg-sky-500/20 text-sky-100'
                  : 'text-zinc-300'
              "
              :aria-current="
                (group ? group.frames.some((frame) => frame.id === packStore.activeItemId) : packStore.activeItemId === item.id) ? 'true' : undefined
              "
              :title="item.filePath"
              :aria-busy="packStore.pendingItemId === item.id"
              @click="selectTexture(group?.frames.find((frame) => frame.id === packStore.activeItemId)?.id ?? item.id)"
            >
              <AssetThumbnail :item="group?.frames.find((frame) => frame.id === packStore.activeItemId) ?? item" />
              <span class="min-w-0 flex-1 truncate">{{ group?.name ?? item.name }}</span>
              <svg
                v-if="group ? group.frames.some((frame) => frame.edited) : item.edited"
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
          </div>
          <ol v-if="group && expandedAnimationIds.has(item.id)" :aria-label="`Frames of ${group.name}`" class="ml-3 border-l border-zinc-600 pl-1">
            <li v-for="(frame, index) in group.frames" :key="frame.id">
              <button type="button" class="flex w-full items-center gap-2 rounded px-1 py-1 text-left text-xs hover:bg-white/5"
                :aria-label="`${group.name}: frame ${index + 1}`"
                :aria-current="packStore.activeItemId === frame.id ? 'true' : undefined"
                :class="packStore.activeItemId === frame.id ? 'bg-sky-500/20 text-sky-100' : 'text-zinc-300'"
                :title="frame.filePath" @click="selectTexture(frame.id)">
                <AssetThumbnail :item="frame" />
                <span class="min-w-0 truncate">{{ frame.name }}</span>
                <span v-if="frame.edited" aria-label="Edited" class="ml-auto text-green-400">Edited</span>
              </button>
            </li>
          </ol>
          <ol v-else-if="expandedAnimationIds.has(item.id)" :aria-label="`Frames of ${item.name}`" class="ml-3 border-l border-zinc-600 pl-1">
            <li v-for="(animationFrame, index) in animations.get(item.id)?.frames" :key="index">
              <button type="button" class="flex w-full items-center gap-2 rounded px-1 py-1 text-left text-xs hover:bg-white/5"
                :aria-label="`${item.name}: frame ${index + 1}`"
                :aria-current="packStore.activeItemId === item.id && packStore.activeFrameIndex === index ? 'true' : undefined"
                :class="packStore.activeItemId === item.id && packStore.activeFrameIndex === index ? 'bg-sky-500/20 text-sky-100' : 'text-zinc-300'"
                :title="`Source frame ${animationFrame.index + 1}, ${animationFrame.time} ticks`"
                @click="selectFrame(item.id, index)">
                <AssetThumbnail :item="item" :frame-index="index" />
                <span>Frame {{ index + 1 }}</span>
                <span class="ml-auto text-[10px] text-zinc-400">{{ animationFrame.time }}t</span>
              </button>
            </li>
          </ol>
        </li>
      </ul>
    </div>
  </section>
</template>
