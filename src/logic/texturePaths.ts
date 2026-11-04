export function getTexturePath(filePath: string): { id: string; categoryPath: string } {
  const relative = filePath.replace(/\\/g, "/")
    .replace(/^(?:assets\/minecraft\/textures\/|assets\/)/, "");
  const parts = relative.split("/");
  const filename = parts.pop();
  if (parts.length === 0 || parts.some((part) => !/^[a-z0-9_-]+$/.test(part)) ||
    !filename || !/^[a-z0-9_-][a-z0-9_.-]*\.png$/.test(filename)) {
    throw new Error(`Cannot determine the Minecraft texture path for "${filePath}".`);
  }
  return { id: filename.slice(0, -4), categoryPath: parts.join("/") };
}
