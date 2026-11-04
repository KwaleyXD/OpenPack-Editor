import { defineStore } from "pinia";
import { effectScope, watch } from "vue";
import { sortTextures } from "../logic/textureSorter";
import { DEFAULT_TEXTURE_PATHS, DEFAULT_TEXTURE_BY_PATH } from "../logic/assetManifest";
import { getTexturePath } from "../logic/texturePaths";
import { initGrid, type Layer } from "../engine/canvasEngine";
import { resizeLayer, type CanvasAnchor } from "../logic/canvasResize";
import type { EditedTexture } from "../engine/exportEngine";
import type { DrawingTool } from "../logic/toolLogic";
import { parsePngToGrid } from "../engine/imageLoader";
import { parseProject, serializeProject } from "./projectPersistence";
import { normalizeHex, parsePalettes, type ColorPalette } from "../logic/colorLogic";

const HISTORY_LIMIT = 30;
const LOCAL_SAVE_KEY = "openpack_save";

export interface TextureItem {
  id: string;
  name: string;
  filePath: string;
  edited: boolean;
  savedLayers?: Layer[];
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

const definePackStore = defineStore("pack", {
  state: () => ({
    packName: "My Custom Pack",
    packDescription: "Made in OpenPack Editor",
    packFormat: 34,
    width: 16,
    height: 16,
    categories: [] as TextureCategory[],
    activeItemId: "",
    pendingItemId: "",
    selectionError: "",
    selectionRequestId: 0,
    persistenceError: "",
    activeColor: "#ffffff",
    recentColors: [] as string[],
    customPalettes: [] as ColorPalette[],
    paletteError: "",
    symmetryHorizontal: false,
    symmetryVertical: false,
    shapeFilled: false,
    activeLayerIndex: 0,
    onionSkinRange: 0,
    activeTool: "pencil" as DrawingTool,
    layers: [
      { id: "layer-0", name: "Layer 1", visible: true, data: initGrid(16) },
    ] as Layer[],
    historyStack: [] as string[],
    redoStack: [] as string[],
  }),

  getters: {
    getEditedItems: (state) => (): EditedTexture[] =>
      state.categories.flatMap(({ items }) => items)
        .filter((item) => item.edited)
        .map((item) => {
          const layers = item.id === state.activeItemId ? state.layers : item.savedLayers;
          if (!layers?.length) {
            throw new Error(`Edited texture "${item.name}" has no saved pixel data.`);
          }
          const path = getTexturePath(item.filePath);
          return {
            ...path,
            metadata: DEFAULT_TEXTURE_BY_PATH.get(`${path.categoryPath}/${path.id}.png`)?.metadata,
            layers,
            width: layers[0].data[0]?.length ?? 0,
            height: layers[0].data.length,
          };
        }),

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
    setActiveColor(color: string) {
      this.activeColor = normalizeHex(color);
      if (this.recentColors[0] !== this.activeColor) {
        this.rememberColor(this.activeColor);
      }
    },

    rememberColor(color: string) {
      const normalized = normalizeHex(color);
      this.recentColors = [normalized, ...this.recentColors.filter((entry) => entry !== normalized)].slice(0, 10);
    },

    loadCustomPalettes() {
      try {
        const saved = window.localStorage.getItem("openpack_palettes");
        this.customPalettes = saved === null ? [] : parsePalettes(saved);
        this.paletteError = "";
      } catch (error) {
        this.paletteError = `Unable to load custom palettes: ${error instanceof Error ? error.message : String(error)}`;
      }
    },

    saveCustomPalette(name: string, colors: readonly string[]): boolean {
      try {
        if (!name.trim() || colors.length === 0) {
          throw new Error("A palette needs a name and at least one color.");
        }
        const palette: ColorPalette = {
          id: `custom-${crypto.randomUUID()}`,
          name: name.trim(),
          colors: [...new Set(colors.map(normalizeHex))],
        };
        const palettes = [...this.customPalettes, palette];
        window.localStorage.setItem("openpack_palettes", JSON.stringify(palettes));
        this.customPalettes = palettes;
        this.paletteError = "";
        return true;
      } catch (error) {
        this.paletteError = `Unable to save custom palette: ${error instanceof Error ? error.message : String(error)}`;
        return false;
      }
    },

    initializeDefaultCategories() {
      this.loadTextures(DEFAULT_TEXTURE_PATHS);
    },

    saveProjectLocal(): boolean {
      try {
        window.localStorage.setItem(LOCAL_SAVE_KEY, serializeProject(this));
        this.persistenceError = "";
        return true;
      } catch (error) {
        this.persistenceError = `Unable to save project locally: ${error instanceof Error ? error.message : String(error)}`;
        return false;
      }
    },

    loadProjectLocal(): boolean {
      try {
        const serialized = window.localStorage.getItem(LOCAL_SAVE_KEY);
        if (serialized === null) {
          this.persistenceError = "";
          return true;
        }
        const project = parseProject(serialized);
        this.selectionRequestId += 1;
        this.$patch({
          ...project,
          width: project.layers[0].data[0].length,
          height: project.layers[0].data.length,
          pendingItemId: "",
          selectionError: "",
          historyStack: [],
          redoStack: [],
          persistenceError: "",
        });
        return true;
      } catch (error) {
        this.persistenceError = `Unable to restore project locally: ${error instanceof Error ? error.message : String(error)}`;
        return false;
      }
    },

    resizeCanvas(newSize: number) {
      this.resizeCanvasAdvanced(newSize, newSize, "center", true);
    },

    resizeCanvasAdvanced(newWidth: number, newHeight: number, anchor: CanvasAnchor, resizeContent: boolean) {
      const layers = this.layers.map((layer) => ({
        ...layer, data: resizeLayer(layer.data, newWidth, newHeight, anchor, resizeContent),
      }));
      if (newWidth === this.width && newHeight === this.height) {
        return;
      }
      this.saveHistorySnapshot();
      this.layers = layers;
      this.width = newWidth;
      this.height = newHeight;
      if (this.activeItemId) {
        this.markItemEdited(this.activeItemId);
      }
    },

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
      this.width = layers[0]?.data[0]?.length ?? 16;
      this.height = layers[0]?.data.length ?? 16;
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
      this.width = layers[0]?.data[0]?.length ?? 16;
      this.height = layers[0]?.data.length ?? 16;
      this.activeLayerIndex = Math.max(0, Math.min(this.activeLayerIndex, layers.length - 1));
    },

    addLayer() {
      const layer: Layer = {
        id: crypto.randomUUID(),
        name: `Layer ${this.layers.length + 1}`,
        visible: true,
        data: Array.from({ length: this.height }, () => Array<null>(this.width).fill(null)),
      };
      this.saveHistorySnapshot();
      this.layers.push(layer);
      this.activeLayerIndex = this.layers.length - 1;
      if (this.activeItemId) {
        this.markItemEdited(this.activeItemId);
      }
    },

    deleteLayer(index: number) {
      if (!Number.isInteger(index) || index < 0 || index >= this.layers.length) {
        throw new RangeError("Layer index is out of bounds.");
      }
      if (this.layers.length === 1) {
        return;
      }
      this.saveHistorySnapshot();
      this.layers.splice(index, 1);
      if (index < this.activeLayerIndex) {
        this.activeLayerIndex -= 1;
      }
      this.activeLayerIndex = Math.min(this.activeLayerIndex, this.layers.length - 1);
      if (this.activeItemId) {
        this.markItemEdited(this.activeItemId);
      }
    },

    moveLayer(fromIndex: number, toIndex: number) {
      for (const index of [fromIndex, toIndex]) {
        if (!Number.isInteger(index) || index < 0 || index >= this.layers.length) {
          throw new RangeError("Layer index is out of bounds.");
        }
      }
      if (fromIndex === toIndex) {
        return;
      }
      const activeId = this.layers[this.activeLayerIndex].id;
      this.saveHistorySnapshot();
      const [layer] = this.layers.splice(fromIndex, 1);
      this.layers.splice(toIndex, 0, layer);
      this.activeLayerIndex = this.layers.findIndex(({ id }) => id === activeId);
      if (this.activeItemId) {
        this.markItemEdited(this.activeItemId);
      }
    },

    toggleLayerVisibility(index: number) {
      if (!Number.isInteger(index) || index < 0 || index >= this.layers.length) {
        throw new RangeError("Layer index is out of bounds.");
      }
      this.saveHistorySnapshot();
      this.layers[index].visible = !this.layers[index].visible;
      if (this.activeItemId) {
        this.markItemEdited(this.activeItemId);
      }
    },

    loadTextures(filePaths: readonly string[]) {
      this.selectionRequestId += 1;
      this.pendingItemId = "";
      this.selectionError = "";
      this.activeItemId = "";
      this.layers = [{ id: "layer-0", name: "Layer 1", visible: true, data: initGrid(16) }];
      this.width = 16;
      this.height = 16;
      this.activeLayerIndex = 0;
      this.historyStack = [];
      this.redoStack = [];
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

    },

    async selectItem(itemId: string): Promise<void> {
      const requestId = ++this.selectionRequestId;
      this.pendingItemId = "";
      this.selectionError = "";
      if (itemId === this.activeItemId) {
        return;
      }
      this.pendingItemId = itemId;
      try {
        const items = this.categories.flatMap(({ items }) => items);
        const next = items.find(({ id }) => id === itemId);
        if (!next) {
          throw new Error(`Texture "${itemId}" does not exist.`);
        }
        let layers: Layer[];
        if (next.savedLayers) {
          layers = JSON.parse(JSON.stringify(next.savedLayers));
        } else {
          const { id, categoryPath } = getTexturePath(next.filePath);
          const texture = DEFAULT_TEXTURE_BY_PATH.get(`${categoryPath}/${id}.png`);
          const width = texture?.width ?? 16;
          const height = texture?.height ?? 16;
          const url = `/vanilla_base/${categoryPath}/${id}.png`;
          const data = width === height
            ? await parsePngToGrid(url, width)
            : await parsePngToGrid(url, width, height);
          layers = [{ id: "layer-0", name: "Vanilla Base", visible: true, data }];
        }
        // A newer selection or pack reload supersedes this result.
        if (requestId !== this.selectionRequestId) {
          return;
        }
        const current = items.find(({ id }) => id === this.activeItemId);
        if (current?.edited) {
          current.savedLayers = JSON.parse(JSON.stringify(this.layers));
        }
        this.activeItemId = itemId;
        this.layers = layers;
        // The active stack owns the data until this edited texture is left again.
        delete next.savedLayers;
        this.width = this.layers[0]?.data[0]?.length ?? 16;
        this.height = this.layers[0]?.data.length ?? 16;
        this.activeLayerIndex = 0;
        this.historyStack = [];
        this.redoStack = [];
      } catch (error) {
        if (requestId !== this.selectionRequestId) {
          return;
        }
        this.selectionError = error instanceof Error ? error.message : String(error);
        throw error;
      } finally {
        if (requestId === this.selectionRequestId) {
          this.pendingItemId = "";
        }
      }
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

const initializedStores = new WeakSet<ReturnType<typeof definePackStore>>();

export const usePackStore = Object.assign(
  (...args: Parameters<typeof definePackStore>) => {
    const store = definePackStore(...args);
    if (initializedStores.has(store) || typeof window === "undefined") {
      return store;
    }
    initializedStores.add(store);
    let canSave = store.loadProjectLocal();
    store.loadCustomPalettes();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const scope = effectScope(true);
    const flushSave = () => {
      clearTimeout(timer);
      timer = undefined;
      if (canSave) {
        store.saveProjectLocal();
      }
    };
    const handleVisibility = () => {
      if (document.visibilityState === "hidden") {
        flushSave();
      }
    };
    scope.run(() => {
      watch(() => store.activeColor, (color) => store.rememberColor(color), { flush: "sync" });
      watch(
        () => [
          store.packName, store.packDescription, store.packFormat, store.categories, store.layers,
          store.activeItemId, store.activeLayerIndex, store.onionSkinRange,
        ],
        () => {
          canSave = true;
          clearTimeout(timer);
          timer = setTimeout(flushSave, 1000);
        },
        { deep: true, flush: "post" },
      );
    });
    window.addEventListener("pagehide", flushSave);
    window.addEventListener("beforeunload", flushSave);
    document.addEventListener("visibilitychange", handleVisibility);
    const dispose = store.$dispose.bind(store);
    store.$dispose = () => {
      clearTimeout(timer);
      scope.stop();
      window.removeEventListener("pagehide", flushSave);
      window.removeEventListener("beforeunload", flushSave);
      document.removeEventListener("visibilitychange", handleVisibility);
      initializedStores.delete(store);
      dispose();
    };
    return store;
  },
  { $id: definePackStore.$id },
);