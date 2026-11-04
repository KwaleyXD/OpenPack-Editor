import textures from "./defaultTextures.json";

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
