import JSZip from "jszip";
import type { EngineState, Layer } from "./canvasEngine";
import { getTexturePath } from "../logic/texturePaths";

export interface EditedTexture extends EngineState {
  /** Minecraft filename stem, not the file-path IDs used by the asset store. */
  id: string;
  categoryPath: string;
  namespace?: string;
  metadata?: string;
}

/** Format 34 is a legacy default; supply the format required by the target game version. */
export function generateMcMeta(packName: string, packFormat = 34, description = packName): string {
  if (!packName.trim()) {
    throw new Error("Pack name must not be empty.");
  }
  if (!Number.isSafeInteger(packFormat) || packFormat <= 0) {
    throw new RangeError("Pack format must be a positive integer.");
  }

  return JSON.stringify({
    pack: {
      pack_format: packFormat,
      description,
    },
  }, null, 2);
}

export function exportCanvasToBlob(
  layers: Layer[],
  width: number,
  height: number,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    if (!Number.isSafeInteger(width) || width <= 0 ||
      !Number.isSafeInteger(height) || height <= 0) {
      throw new RangeError("Texture dimensions must be positive integers.");
    }

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) {
      throw new Error("Unable to initialize the export canvas 2D context.");
    }

    // Export layer and pixel alpha using source-over, without onion-skin opacity.
    context.globalAlpha = 1;
    context.globalCompositeOperation = "source-over";
    context.imageSmoothingEnabled = false;

    for (const layer of layers) {
      if (!layer.visible) {
        continue;
      }
      if (layer.data.length !== height ||
        layer.data.some((row) => row.length !== width)) {
        throw new Error(`Layer "${layer.name}" does not match the texture dimensions.`);
      }

      context.globalAlpha = layer.opacity ?? 1;
      for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
          const color = layer.data[y][x];
          if (color === null) {
            continue;
          }
          if (!/^#(?:[\da-f]{3}|[\da-f]{4}|[\da-f]{6}|[\da-f]{8})$/i.test(color)) {
            throw new Error(`Invalid hex color in layer "${layer.name}" at (${x}, ${y}).`);
          }
          context.fillStyle = color;
          context.fillRect(x, y, 1, 1);
        }
      }
    }
    context.globalAlpha = 1;

    canvas.toBlob((blob) => {
      if (blob === null) {
        reject(new Error("Unable to encode the texture as PNG."));
      } else {
        resolve(blob);
      }
    }, "image/png");
  });
}

export async function buildPackZip(
  packName: string,
  editedItems: readonly EditedTexture[],
  packFormat = 34,
  packDescription = packName,
  sourceArchive?: Blob,
): Promise<Blob> {
  const zip = sourceArchive ? await JSZip.loadAsync(sourceArchive) : new JSZip();
  if (!sourceArchive || !zip.file("pack.mcmeta")) {
    zip.file("pack.mcmeta", generateMcMeta(packName, packFormat, packDescription));
  }

  const paths = new Set<string>();
  const entries = editedItems.map((item) => {
    if (!/^[a-z0-9_-][a-z0-9_.-]*$/.test(item.id) || item.id.endsWith(".png")) {
      throw new Error("Texture exports require a valid filename stem.");
    }
    const categoryPath = item.categoryPath.replace(/\/$/, "");
    if (item.metadata !== undefined) JSON.parse(item.metadata);
    const namespace = item.namespace ?? "minecraft";
    if (!/^[a-z0-9_.-]+$/.test(namespace) || namespace === "." || namespace === "..") {
      throw new Error("Texture exports require a valid namespace.");
    }
    const texturePath = `${categoryPath ? `${categoryPath}/` : ""}${item.id}.png`;
    getTexturePath(`assets/${namespace}/textures/${texturePath}`);
    const path = `assets/${namespace}/textures/${texturePath}`;
    if (paths.has(path)) {
      throw new Error(`Duplicate texture export path: ${path}`);
    }
    paths.add(path);
    return { item, path };
  });

  for (const { item, path } of entries) {
    const png = await exportCanvasToBlob(item.layers, item.width, item.height);
    zip.file(path, await png.arrayBuffer());
    if (item.metadata !== undefined) zip.file(`${path}.mcmeta`, item.metadata);
  }

  const blob = await zip.generateAsync({ type: "blob" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  try {
    anchor.href = url;
    anchor.download = `${packName.trim().replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_")}.zip`;
    anchor.hidden = true;
    document.body.append(anchor);
    anchor.click();
  } finally {
    anchor.remove();
    // Allow the browser to start consuming the download before releasing the URL.
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
  return blob;
}
