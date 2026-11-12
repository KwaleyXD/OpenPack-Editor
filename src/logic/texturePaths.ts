export function getTexturePath(filePath: string): { id: string; categoryPath: string; namespace?: string } {
  const normalized = filePath.replace(/\\/g, "/");
  const namespaced = normalized.match(/^assets\/([a-z0-9_.-]+)\/textures\/(.+)$/);
  const namespace = namespaced?.[1];
  const relative = namespaced?.[2] ?? normalized
    .replace(/^assets\/minecraft\/textures\//, "")
    .replace(/^assets\//, "");
  const parts = relative.split("/");
  const filename = parts.pop();
  if ((namespace === "." || namespace === "..") ||
    (!namespaced && parts.length === 0) ||
    parts.some((part) => !/^[a-z0-9_.-]+$/.test(part) || part === "." || part === "..") ||
    !filename || !/^[a-z0-9_-][a-z0-9_.-]*\.png$/.test(filename)) {
    throw new Error(`Cannot determine the Minecraft texture path for "${filePath}".`);
  }
  return {
    id: filename.slice(0, -4),
    categoryPath: parts.join("/"),
    ...(namespace && namespace !== "minecraft" ? { namespace } : {}),
  };
}
