import type { Layer } from "../engine/canvasEngine";
import type { TextureCategory } from "./packState";
import { getTextureAnimation } from "../logic/assetManifest";
import { getCategoryId, sortTextures } from "../logic/textureSorter";

interface ProjectData {
  packName: string;
  packDescription: string;
  packFormat: number;
  categories: TextureCategory[];
  activeItemId: string;
  layers: Layer[];
  activeLayerIndex: number;
  activeFrameIndex?: number;
  onionSkinRange: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isLayer(value: unknown): value is Layer {
  return isRecord(value) &&
    typeof value.id === "string" && typeof value.name === "string" &&
    typeof value.visible === "boolean" &&
    (value.opacity === undefined || (typeof value.opacity === "number" &&
      Number.isFinite(value.opacity) && value.opacity >= 0 && value.opacity <= 1)) &&
    Array.isArray(value.data) && value.data.length > 0 &&
    value.data.every((row: unknown) =>
      Array.isArray(row) && row.length > 0 &&
      row.every((pixel: unknown) => pixel === null ||
        (typeof pixel === "string" && /^#(?:[\da-f]{3}|[\da-f]{4}|[\da-f]{6}|[\da-f]{8})$/i.test(pixel))),
    );
}

function isLayerStack(value: unknown): value is Layer[] {
  if (!Array.isArray(value) || value.length === 0 || !value.every(isLayer)) {
    return false;
  }
  const width = value[0].data[0].length;
  const height = value[0].data.length;
  return new Set(value.map(({ id }) => id)).size === value.length &&
    value.every((layer) => layer.data.length === height &&
      layer.data.every((row) => row.length === width));
}

function isCategory(value: unknown): value is TextureCategory {
  return isRecord(value) && typeof value.id === "string" &&
    typeof value.name === "string" && Array.isArray(value.items) &&
    value.items.every((item: unknown) => isRecord(item) &&
      typeof item.id === "string" && typeof item.name === "string" &&
      typeof item.filePath === "string" && typeof item.edited === "boolean" &&
      (item.savedLayers === undefined || isLayerStack(item.savedLayers)));
}

export function serializeProject(project: ProjectData): string {
  const activeItem = project.categories.flatMap(({ items }) => items)
    .find(({ id }) => id === project.activeItemId);
  return JSON.stringify({
    version: 1,
    packName: project.packName,
    packDescription: project.packDescription,
    packFormat: project.packFormat,
    categories: project.categories.map((category) => ({
      ...category,
      items: category.items.map((item) =>
        item.id === project.activeItemId && item.edited
          ? { ...item, savedLayers: project.layers }
          : item,
      ),
    })),
    activeItemId: project.activeItemId,
    // Edited active layers are already stored in categories; avoid duplicating pixels.
    canvasLayers: activeItem?.edited ? undefined : project.layers,
    activeLayerIndex: project.activeLayerIndex,
    activeFrameIndex: project.activeFrameIndex ?? 0,
    onionSkinRange: project.onionSkinRange,
  });
}

export function parseProject(serialized: string): ProjectData {
  const value: unknown = JSON.parse(serialized);
  if (!isRecord(value) || value.version !== 1 ||
    typeof value.packName !== "string" || typeof value.packDescription !== "string" ||
    (value.packFormat !== undefined &&
      (typeof value.packFormat !== "number" || !Number.isSafeInteger(value.packFormat) || value.packFormat <= 0)) ||
    typeof value.activeItemId !== "string" ||
    typeof value.activeLayerIndex !== "number" || !Number.isInteger(value.activeLayerIndex) ||
    typeof value.onionSkinRange !== "number" || !Number.isInteger(value.onionSkinRange) ||
    value.onionSkinRange < 0 || value.onionSkinRange > 3 ||
    !Array.isArray(value.categories) || !value.categories.every(isCategory)) {
    throw new Error("The local project save has an invalid or unsupported format.");
  }
  const categories = value.categories;
  const items = categories.flatMap(({ items }) => items);
  const activeItem = items.find(({ id }) => id === value.activeItemId);
  const layers = activeItem?.edited ? activeItem.savedLayers : value.canvasLayers;
  if ((value.activeItemId !== "" && !activeItem) || !isLayerStack(layers) ||
    value.activeLayerIndex < 0 || value.activeLayerIndex >= layers.length ||
    (value.activeFrameIndex !== undefined &&
      (typeof value.activeFrameIndex !== "number" || !Number.isInteger(value.activeFrameIndex) || value.activeFrameIndex < 0)) ||
    new Set(items.map(({ id }) => id)).size !== items.length ||
    new Set(categories.map(({ id }) => id)).size !== categories.length ||
    items.some((item) => item.edited && !item.savedLayers)) {
    throw new Error("The local project save contains inconsistent texture or layer data.");
  }
  if (activeItem) {
    delete activeItem.savedLayers;
  }
  const activeFrameIndex = typeof value.activeFrameIndex === "number" ? value.activeFrameIndex : 0;
  const animation = activeItem ? getTextureAnimation(activeItem.filePath, layers[0].data[0].length, layers[0].data.length) : null;
  if (activeFrameIndex >= (animation?.frames.length ?? 1)) {
    throw new Error("The local project save contains an invalid selected animation frame.");
  }
  const sortedCategories = sortTextures(items.map((item) => item.filePath)).map(({ category, files }) => {
    const paths = new Set(files);
    return { id: getCategoryId(category), name: category, items: items.filter((item) => paths.has(item.filePath)) };
  });
  return {
    packName: value.packName,
    packDescription: value.packDescription,
    packFormat: typeof value.packFormat === "number" ? value.packFormat : 34,
    categories: sortedCategories,
    activeItemId: value.activeItemId,
    layers,
    activeLayerIndex: value.activeLayerIndex,
    activeFrameIndex,
    onionSkinRange: value.onionSkinRange,
  };
}
