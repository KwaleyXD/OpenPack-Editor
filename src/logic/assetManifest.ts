import textures from "./defaultTextures.json";
import { getTexturePath } from "./texturePaths";
import { parseAnimation } from "./animationLogic";

export interface DefaultTexture {
  path: string;
  width: number;
  height: number;
  metadata?: string;
}

export const DEFAULT_TEXTURES: readonly DefaultTexture[] = textures;
export const DEFAULT_TEXTURE_PATHS: readonly string[] = DEFAULT_TEXTURES.map(({ path }) => path);
export const DEFAULT_TEXTURE_BY_PATH: ReadonlyMap<string, DefaultTexture> =
  new Map(DEFAULT_TEXTURES.map((texture) => [texture.path, texture]));

export function getTextureAnimation(filePath: string, width?: number, height?: number) {
  const { categoryPath, id } = getTexturePath(filePath);
  const texture = DEFAULT_TEXTURE_BY_PATH.get(`${categoryPath}/${id}.png`);
  return texture ? parseAnimation(texture.metadata, texture.width, texture.height, width, height) : null;
}
