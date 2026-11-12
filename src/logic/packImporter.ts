import JSZip from "jszip";
import { getTexturePath } from "./texturePaths";
import { parseAnimation } from "./animationLogic";
import { usePackStore } from "../stores/packState";
import { deleteSourcePack, saveSourcePack } from "../stores/sourcePackStorage";

const MAX_TEXTURES = 10_000;
const MAX_TOTAL_TEXTURE_BYTES = 512 * 1024 * 1024;
const MAX_TEXTURE_DIMENSION = 8192;
const MAX_TEXTURE_PIXELS = 16_777_216;

interface ImportedTexture {
  path: string;
  width: number;
  height: number;
  metadata?: string;
}

function getPngDimensions(data: Uint8Array, path: string): { width: number; height: number } {
  const signature = [137, 80, 78, 71, 13, 10, 26, 10];
  if (data.length < 24 || !signature.every((byte, index) => data[index] === byte) ||
    String.fromCharCode(...data.slice(12, 16)) !== "IHDR") {
    throw new Error(`"${path}" is not a valid PNG texture.`);
  }
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const width = view.getUint32(16);
  const height = view.getUint32(20);
  if (width === 0 || height === 0 || width > MAX_TEXTURE_DIMENSION ||
    height > MAX_TEXTURE_DIMENSION || width * height > MAX_TEXTURE_PIXELS) {
    throw new Error(`"${path}" has unsupported dimensions (${width} by ${height}).`);
  }
  return { width, height };
}

function parsePackMetadata(contents: string | undefined, filename: string): {
  name: string;
  description: string;
  format: number;
} {
  const fallbackName = filename.replace(/\.zip$/i, "").trim() || "Imported Pack";
  if (contents === undefined) {
    return { name: fallbackName, description: fallbackName, format: 34 };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(contents);
  } catch {
    throw new Error("The pack.mcmeta file contains invalid JSON.");
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("The pack.mcmeta file has an invalid structure.");
  }
  const pack = (parsed as Record<string, unknown>).pack;
  if (typeof pack !== "object" || pack === null || Array.isArray(pack)) {
    throw new Error("The pack.mcmeta file is missing pack metadata.");
  }
  const metadata = pack as Record<string, unknown>;
  const description = typeof metadata.description === "string"
    ? metadata.description
    : metadata.description === undefined ? fallbackName : JSON.stringify(metadata.description);
  const format = typeof metadata.pack_format === "number" &&
    Number.isSafeInteger(metadata.pack_format) && metadata.pack_format > 0
    ? metadata.pack_format : 34;
  return { name: fallbackName, description, format };
}

export async function importResourcePack(file: File): Promise<void> {
  if (!file.name.toLowerCase().endsWith(".zip")) {
    throw new Error("Choose a resource pack ZIP file.");
  }
  const zip = await JSZip.loadAsync(file);
  const entries = Object.values(zip.files).filter((entry) => !entry.dir);
  const textures = entries.filter((entry) =>
    /^assets\/[a-z0-9_.-]+\/textures\/.+\.png$/i.test(entry.name));
  if (textures.length === 0) {
    throw new Error("This ZIP contains no textures under assets/<namespace>/textures/.");
  }
  if (textures.length > MAX_TEXTURES) {
    throw new Error(`This pack contains too many textures (maximum ${MAX_TEXTURES.toLocaleString()}).`);
  }

  const metadataFiles = new Map<string, string>();
  const texturePaths = new Set(textures.map(({ name }) => name));
  for (const entry of entries.filter(({ name }) => name.endsWith(".png.mcmeta"))) {
    if (texturePaths.has(entry.name.slice(0, -".mcmeta".length))) {
      metadataFiles.set(entry.name.slice(0, -".mcmeta".length), await entry.async("string"));
    }
  }

  const importedTextures: ImportedTexture[] = [];
  let totalTextureBytes = 0;
  for (const entry of textures) {
    const path = entry.name;
    const { id } = getTexturePath(path);
    if (!id) {
      throw new Error(`Cannot determine the texture path for "${path}".`);
    }
    const data = await entry.async("uint8array");
    totalTextureBytes += data.byteLength;
    if (totalTextureBytes > MAX_TOTAL_TEXTURE_BYTES) {
      throw new Error("The pack's uncompressed textures exceed the 512 MB import limit.");
    }
    const { width, height } = getPngDimensions(data, path);
    const metadata = metadataFiles.get(path);
    if (metadata !== undefined) {
      try {
        parseAnimation(metadata, width, height);
      } catch (error) {
        throw new Error(`Invalid animation metadata for "${path}": ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    importedTextures.push({ path, width, height, metadata });
  }

  const packMetadataFile = zip.file("pack.mcmeta");
  const pack = parsePackMetadata(
    packMetadataFile ? await packMetadataFile.async("string") : undefined,
    file.name,
  );
  const importedPackId = crypto.randomUUID();
  await saveSourcePack(importedPackId, file);

  const store = usePackStore();
  const previousPackId = store.importedPackId;
  const paths = importedTextures.map(({ path }) => path);
  const itemByPath = new Map<string, ImportedTexture>(importedTextures.map((texture) => [texture.path, texture]));
  store.loadTextures(paths);
  for (const category of store.categories) {
    for (const item of category.items) {
      const source = itemByPath.get(item.filePath);
      if (!source) continue;
      item.sourceWidth = source.width;
      item.sourceHeight = source.height;
      item.metadata = source.metadata;
    }
  }
  store.$patch({
    importedPackId,
    packName: pack.name,
    packDescription: pack.description,
    packFormat: pack.format,
    activeTool: "pencil",
    activeColor: "#ffffff",
    recentColors: [],
    onionSkinRange: 0,
    symmetryHorizontal: false,
    symmetryVertical: false,
    shapeFilled: false,
    persistenceError: "",
  });
  if (!store.saveProjectLocal()) {
    throw new Error(`The imported pack is open, but was not saved. ${store.persistenceError}`);
  }
  if (previousPackId) {
    try {
      await deleteSourcePack(previousPackId);
    } catch (error) {
      store.persistenceError = `The pack was imported, but its previous source archive could not be removed: ${error instanceof Error ? error.message : String(error)}`;
    }
  }
}
