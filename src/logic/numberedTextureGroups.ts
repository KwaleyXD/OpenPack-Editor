import { getTexturePath } from "./texturePaths";

export interface NumberedTextureGroup<T> {
  name: string;
  frames: T[];
}

export function groupNumberedTextures<T extends { filePath: string }>(items: readonly T[]): NumberedTextureGroup<T>[] {
  const groups = new Map<string, Array<{ item: T; index: number }>>();
  for (const item of items) {
    const path = item.filePath.replace(/\\/g, "/")
      .replace(/^(?:assets\/minecraft\/textures\/|assets\/)/, "");
    const match = /^item\/(clock|compass|recovery_compass)_(\d+)\.png$/.exec(path);
    if (!match) continue;
    const index = Number(match[2]);
    if (!Number.isSafeInteger(index)) continue;
    const entries = groups.get(match[1]) ?? [];
    entries.push({ item, index });
    groups.set(match[1], entries);
  }
  return [...groups].flatMap(([name, entries]) => {
    if (entries.length < 2 || new Set(entries.map(({ index }) => index)).size !== entries.length) return [];
    entries.sort((a, b) => a.index - b.index);
    return [{ name: `${name}.png`, frames: entries.map(({ item }) => item) }];
  });
}

export function textureSource(filePath: string): { url: string; key: string } {
  const { id, categoryPath } = getTexturePath(filePath);
  return { url: `/vanilla_base/${categoryPath}/${id}.png`, key: `${categoryPath}/${id}.png` };
}
