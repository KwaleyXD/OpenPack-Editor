<script setup lang="ts">
import { onMounted } from "vue";
import AppLayout from "./components/layout/AppLayout.vue";
import PrimarySidebar from "./components/navigation/PrimarySidebar.vue";
import AssetExplorer from "./components/explorer/AssetExplorer.vue";
import CanvasWorkspace from "./components/workspace/CanvasWorkspace.vue";
import RightPanel from "./components/panels/RightPanel.vue";
import { usePackStore } from "./stores/packState";

// Store initialization restores an existing save before the panels mount.
const store = usePackStore();

onMounted(() => {
  try {
    if (window.localStorage.getItem("openpack_save") === null && !store.persistenceError) {
      store.initializeDefaultCategories();
    }
  } catch (error) {
    store.persistenceError = `Unable to access the local project save: ${error instanceof Error ? error.message : String(error)}`;
  }
});
</script>

<template>
  <div class="flex min-h-dvh bg-[#292929]">
    <AppLayout class="flex-1">
      <template #header>
        <h1 class="truncate text-sm font-medium">{{ store.packName }}</h1>
      </template>
      <template #primary-sidebar><PrimarySidebar /></template>
      <template #asset-explorer><AssetExplorer /></template>
      <template #workspace><CanvasWorkspace /></template>
      <template #right-panel><RightPanel /></template>
    </AppLayout>
  </div>
</template>