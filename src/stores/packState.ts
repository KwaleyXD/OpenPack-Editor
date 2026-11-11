import { defineStore } from "pinia";
import { effectScope, toRaw, watch } from "vue";
import { getCategoryId, sortTextures } from "../logic/textureSorter";
import { DEFAULT_TEXTURE_PATHS, DEFAULT_TEXTURE_BY_PATH, getTextureAnimation } from "../logic/assetManifest";
import { getTexturePath } from "../logic/texturePaths";
import { initGrid, type Layer, type PixelColor } from "../engine/canvasEngine";
import { resizeLayer, type CanvasAnchor } from "../logic/canvasResize";
import type { EditedTexture } from "../engine/exportEngine";
import type { DrawingTool, ShadeMode } from "../logic/toolLogic";
import { parsePngToGrid } from "../engine/imageLoader";
import { parseProject, serializeProject } from "./projectPersistence";
import { normalizeHex, parsePalettes, type ColorPalette } from "../logic/colorLogic";
import { frameLayers, getFrameRect, readFrame, writeFrame, type FrameRect, type TextureAnimation } from "../logic/animationLogic";
import { groupNumberedTextures } from "../logic/numberedTextureGroups";
import { applySelection, copySelection, type PixelClipboard, type Selection } from "../logic/selectionLogic";

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
    activeFrameIndex: 0,
    onionSkinRange: 0,
    renderRevision: 0,
    activeTool: "pencil" as DrawingTool,
    selection: null as Selection | null,
    clipboard: null as PixelClipboard | null,
    pastedBase: null as PixelColor[][] | null,
    selectionToolError: "",
    shadeMode: "lighten" as ShadeMode,
    layers: [
      { id: "layer-0", name: "Layer 1", visible: true, data: initGrid(16) },
    ] as Layer[],
    historyStack: [] as string[],
    redoStack: [] as string[],
  }),

  getters: {
    activeNumberedGroup(state) {
      for (const category of state.categories) {
        const group = groupNumberedTextures(category.items)
          .find(({ frames }) => frames.some(({ id }) => id === state.activeItemId));
        if (group) return group;
      }
      return null;
    },
    activeAnimation(state): TextureAnimation | null {
      const item = state.categories.flatMap(({ items }) => items).find(({ id }) => id === state.activeItemId);
      return item ? getTextureAnimation(item.filePath, state.width, state.height) : null;
    },
    frameRect(state): FrameRect {
      return this.activeAnimation ? getFrameRect(this.activeAnimation, state.activeFrameIndex) :
        { x: 0, y: 0, width: state.width, height: state.height };
    },
    frameWidth(): number { return this.frameRect.width; },
    frameHeight(): number { return this.frameRect.height; },
    frameLayers(state): Layer[] {
      // Raw brush writes publish renderRevision once per input event.
      void state.renderRevision;
      return this.activeAnimation ? frameLayers(toRaw(state.layers), this.frameRect) : toRaw(state.layers);
    },
    getEditedItems: (state) => (): EditedTexture[] =>
      state.categories.flatMap(({ items }) => items)
        .filter((item) => item.edited)
        .map((item) => {
          const layers = item.id === state.activeItemId ? state.layers : item.savedLayers;
          if (!layers?.length) {
            throw new Error(`Edited texture "${item.name}" has no saved pixel data.`);
          }
          const path = getTexturePath(item.filePath);
          const width = layers[0].data[0].length, height = layers[0].data.length;
          const source = DEFAULT_TEXTURE_BY_PATH.get(`${path.categoryPath}/${path.id}.png`);
          const animation = getTextureAnimation(item.filePath, width, height);
          let metadata = source?.metadata;
          if (metadata && animation && (source?.width !== width || source?.height !== height)) {
            const updated = JSON.parse(metadata);
            updated.animation.width = animation.width;
            updated.animation.height = animation.height;
            metadata = JSON.stringify(updated);
          }
          return {
            ...path,
            metadata,
            layers,
            width,
            height,
          };
        }),

    categoryProgress:
      (state) =>
      (categoryId: string): CategoryProgress => {
        const category = state.categories.find(({ id }) => id === categoryId);
        const items = category?.items ?? [];
        const groups = groupNumberedTextures(items);
        const grouped = new Set(groups.flatMap(({ frames }) => frames.map(({ id }) => id)));
        const total = items.length - grouped.size + groups.length;
        const completed = items.filter(({ id, edited }) => !grouped.has(id) && edited).length +
          groups.filter(({ frames }) => frames.some(({ edited }) => edited)).length;
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
    async resetActiveTexture(itemId: string): Promise<boolean> {
      if (this.pendingItemId || itemId !== this.activeItemId) {
        throw new Error("Select the texture to reset and wait for it to finish loading.");
      }
      const item = this.categories.flatMap(({ items }) => items).find(({ id }) => id === itemId);
      if (!item?.edited) throw new Error("The selected texture has no edits to reset.");
      const { id, categoryPath } = getTexturePath(item.filePath);
      const texture = DEFAULT_TEXTURE_BY_PATH.get(`${categoryPath}/${id}.png`);
      if (!texture) throw new Error(`No Minecraft default is available for "${item.name}".`);
      const originalLayers = JSON.stringify(this.layers);
      const requestId = ++this.selectionRequestId;
      this.pendingItemId = itemId;
      this.selectionError = "";
      try {
        const url = `/vanilla_base/${categoryPath}/${id}.png`;
        const data = texture.width === texture.height
          ? await parsePngToGrid(url, texture.width)
          : await parsePngToGrid(url, texture.width, texture.height);
        if (requestId !== this.selectionRequestId || this.activeItemId !== itemId) return false;
        if (JSON.stringify(this.layers) !== originalLayers) {
          throw new Error("The texture changed while its default was loading. Reset was cancelled.");
        }
        getTextureAnimation(item.filePath, texture.width, texture.height);
        this.layers = [{ id: "layer-0", name: "Vanilla Base", visible: true, data }];
        this.width = texture.width;
        this.height = texture.height;
        this.activeLayerIndex = 0;
        this.activeFrameIndex = 0;
        this.historyStack = [];
        this.redoStack = [];
        this.clearSelection();
        item.edited = false;
        delete item.savedLayers;
        return true;
      } finally {
        if (requestId === this.selectionRequestId) this.pendingItemId = "";
      }
    },

    clearSelection() {
      this.selection = null;
      this.pastedBase = null;
      this.selectionToolError = "";
    },

    copySelectedPixels(): boolean {
      if (!this.selection) {
        this.selectionToolError = "Select pixels before copying.";
        return false;
      }
      this.clipboard = copySelection(this.frameLayers[this.activeLayerIndex].data, this.selection);
      this.selectionToolError = "";
      return true;
    },

    pasteSelectedPixels(): boolean {
      if (!this.clipboard) {
        this.selectionToolError = "Copy a selection before pasting.";
        return false;
      }
      const layer = this.layers[this.activeLayerIndex];
      if (!layer?.visible || this.pendingItemId) {
        this.selectionToolError = "Select a visible layer and wait for the texture to finish loading.";
        return false;
      }
      const width = this.clipboard.mask[0].length, height = this.clipboard.mask.length;
      if (width > this.frameWidth || height > this.frameHeight) {
        this.selectionToolError = "The copied selection is larger than this frame.";
        return false;
      }
      const clipboard = this.clipboard;
      const mask = clipboard.mask.map((row, y) => row.map((selected, x) =>
        selected && clipboard.pixels[y][x] !== null));
      if (!mask.some((row) => row.some(Boolean))) {
        this.selectionToolError = "The copied selection contains no visible pixels.";
        return false;
      }
      const original = readFrame(toRaw(layer.data), this.frameRect);
      const result = applySelection(original, clipboard, 0, 0);
      this.saveHistorySnapshot();
      writeFrame(toRaw(layer.data), this.frameRect, result);
      this.renderRevision += 1;
      if (this.activeItemId) this.markItemEdited(this.activeItemId);
      this.pastedBase = original;
      this.selection = { x: 0, y: 0, mask };
      this.selectionToolError = "";
      this.activeTool = "move";
      return true;
    },

    selectFrame(index: number) {
      if (!this.activeAnimation) throw new Error("The selected texture has no animation frames.");
      getFrameRect(this.activeAnimation, index);
      this.activeFrameIndex = index;
    },
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

    clearRecentColors() {
      this.recentColors = [];
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

    deleteCustomPalette(id: string): boolean {
      try {
        const palettes = this.customPalettes.filter((palette) => palette.id !== id);
        if (palettes.length === this.customPalettes.length) {
          throw new Error("The custom palette no longer exists.");
        }
        window.localStorage.setItem("openpack_palettes", JSON.stringify(palettes));
        this.customPalettes = palettes;
        this.paletteError = "";
        return true;
      } catch (error) {
        this.paletteError = `Unable to delete custom palette: ${error instanceof Error ? error.message : String(error)}`;
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
      const animation = this.activeAnimation;
      const layers = this.layers.map((layer) => {
        if (!animation) return { ...layer, data: resizeLayer(layer.data, newWidth, newHeight, anchor, resizeContent) };
        // Resize each physical cell, including cells omitted or repeated by the playback sequence.
        const cells = Array.from({ length: animation.columns * animation.rows }, (_, index) => {
          const rect = {
            x: (index % animation.columns) * animation.width,
            y: Math.floor(index / animation.columns) * animation.height,
            width: animation.width, height: animation.height,
          };
          return resizeLayer(readFrame(layer.data, rect), newWidth, newHeight, anchor, resizeContent);
        });
        const data = Array.from({ length: newHeight * animation.rows }, () =>
          Array<null>(newWidth * animation.columns).fill(null));
        cells.forEach((cell, index) => writeFrame(data, {
          x: (index % animation.columns) * newWidth, y: Math.floor(index / animation.columns) * newHeight,
          width: newWidth, height: newHeight,
        }, cell));
        return { ...layer, data };
      });
      if (newWidth === this.frameWidth && newHeight === this.frameHeight) {
        return;
      }
      this.saveHistorySnapshot();
      this.layers = layers;
      this.width = newWidth * (animation?.columns ?? 1);
      this.height = newHeight * (animation?.rows ?? 1);
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

    setLayerOpacity(index: number, opacity: number, saveHistory = true) {
      if (!Number.isInteger(index) || index < 0 || index >= this.layers.length) {
        throw new RangeError("Layer index is out of bounds.");
      }
      if (!Number.isFinite(opacity) || opacity < 0 || opacity > 1) {
        throw new RangeError("Layer opacity must be between 0 and 1.");
      }
      if ((this.layers[index].opacity ?? 1) === opacity) return;
      if (saveHistory) this.saveHistorySnapshot();
      this.layers[index].opacity = opacity;
      if (this.activeItemId) this.markItemEdited(this.activeItemId);
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
      this.activeFrameIndex = 0;
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
        getTextureAnimation(next.filePath, layers[0].data[0].length, layers[0].data.length);
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
        this.activeFrameIndex = 0;
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
      const scheduleSave = () => {
        canSave = true;
        clearTimeout(timer);
        timer = setTimeout(flushSave, 1000);
      };
      // Traverse pixel data once per mutation batch, shared by all preview consumers.
      watch(() => store.layers, () => {
        store.renderRevision += 1;
        scheduleSave();
      }, { deep: true, flush: "post" });
      // Asset metadata must not be traversed again for every brush movement.
      watch(() => store.categories, scheduleSave, { deep: true, flush: "post" });
      watch(
        () => [
          store.packName, store.packDescription, store.packFormat,
          store.activeItemId, store.activeLayerIndex, store.activeFrameIndex, store.onionSkinRange, store.renderRevision,
        ],
        scheduleSave,
        { flush: "post" },
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
