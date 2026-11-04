import { defineStore } from "pinia";
import { sortTextures } from "../logic/textureSorter";
import { initGrid, type Layer } from "../engine/canvasEngine";
import type { DrawingTool } from "../logic/toolLogic";

const HISTORY_LIMIT = 30;

export interface TextureItem {
  id: string;
  name: string;
  filePath: string;
  edited: boolean;
}

export interface TextureCategory {
  id: string;
  name: string;
  items: TextureItem[];
}

export interface CategoryProgress {
  total: number;
  completed: number;
  formatted: string;
  color: string;
}

function getFilename(filePath: string): string {
  return filePath.split(/[\\/]/).pop() ?? filePath;
}

function getCategoryId(categoryName: string): string {
  return categoryName.toLowerCase().replace(/[^a-z0-9]+/g, "-");
}

export const usePackStore = defineStore("pack", {
  state: () => ({
    categories: [] as TextureCategory[],
    activeItemId: "",
    activeColor: "#ffffff",
    activeLayerIndex: 0,
    activeTool: "pencil" as DrawingTool,
    layers: [
      { id: "layer-0", name: "Layer 1", visible: true, data: initGrid(16) },
    ] as Layer[],
    historyStack: [] as string[],
    redoStack: [] as string[],
  }),

  getters: {
    categoryProgress:
      (state) =>
      (categoryId: string): CategoryProgress => {
        const category = state.categories.find(({ id }) => id === categoryId);
        const total = category?.items.length ?? 0;
        const completed =
          category?.items.filter(({ edited }) => edited).length ?? 0;
        const color =
          total === 0
            ? "#ef4444"
            : completed === total
              ? "#22c55e"
              : completed > 0
                ? "#f97316"
                : "#ef4444";

        return {
          total,
          completed,
          formatted: `${completed}/${total}`,
          color,
        };
      },
  },

  actions: {
    // Capture before mutation: the current state becomes the redo target on undo.
    saveHistorySnapshot() {
      this.historyStack.push(JSON.stringify(this.layers));
      this.redoStack = [];
      if (this.historyStack.length > HISTORY_LIMIT) {
        this.historyStack.shift();
      }
    },

    undo() {
      const snapshot = this.historyStack.at(-1);
      if (snapshot === undefined) {
        return;
      }

      const layers: Layer[] = JSON.parse(snapshot);
      this.redoStack.push(JSON.stringify(this.layers));
      if (this.redoStack.length > HISTORY_LIMIT) {
        this.redoStack.shift();
      }
      this.historyStack.pop();
      this.layers = layers;
      this.activeLayerIndex = Math.max(0, Math.min(this.activeLayerIndex, layers.length - 1));
    },

    redo() {
      const snapshot = this.redoStack.at(-1);
      if (snapshot === undefined) {
        return;
      }

      const layers: Layer[] = JSON.parse(snapshot);
      this.historyStack.push(JSON.stringify(this.layers));
      if (this.historyStack.length > HISTORY_LIMIT) {
        this.historyStack.shift();
      }
      this.redoStack.pop();
      this.layers = layers;
      this.activeLayerIndex = Math.max(0, Math.min(this.activeLayerIndex, layers.length - 1));
    },

    addLayer() {
      this.layers.push({
        id: crypto.randomUUID(),
        name: `Layer ${this.layers.length + 1}`,
        visible: true,
        data: initGrid(16),
      });
      this.activeLayerIndex = this.layers.length - 1;
    },

    loadTextures(filePaths: readonly string[]) {
      this.categories = sortTextures(filePaths).map(({ category, files }) => ({
        id: getCategoryId(category),
        name: category,
        items: files.map((filePath) => ({
          id: filePath,
          name: getFilename(filePath),
          filePath,
          edited: false,
        })),
      }));

      if (!this.categories.some(({ items }) =>
        items.some(({ id }) => id === this.activeItemId),
      )) {
        this.activeItemId = "";
      }
    },

    selectItem(itemId: string) {
      this.activeItemId = itemId;
    },

    markItemEdited(itemId: string) {
      for (const category of this.categories) {
        const item = category.items.find(({ id }) => id === itemId);

        if (item) {
          item.edited = true;
          return;
        }
      }
    },
  },
});