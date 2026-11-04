import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import JSZip from "jszip";

const archive = process.argv[2];
if (!archive) throw new Error("Usage: node scripts/import-default-textures.mjs <template.zip>");
const root = fileURLToPath(new URL("../", import.meta.url));
const target = path.join(root, "public/vanilla_base");
const prefix = "assets/minecraft/textures/";
const zip = await JSZip.loadAsync(await fs.readFile(archive), { checkCRC32: true });
const entries = [];
for (const file of Object.values(zip.files).sort((a, b) => a.name.localeCompare(b.name, "en"))) {
  if (file.dir || !file.name.startsWith(prefix) || !file.name.endsWith(".png")) continue;
  const relative = file.name.slice(prefix.length);
  if (!/^(?:[a-z0-9_-]+\/)+[a-z0-9_.-]+\.png$/.test(relative) ||
    relative.split("/").some((part) => part === "." || part === "..") ||
    file.unsafeOriginalName !== file.name) {
    throw new Error(`Unsafe texture path: ${file.name}`);
  }
  const bytes = await file.async("nodebuffer");
  if (bytes.length < 24 || bytes.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a") {
    throw new Error(`Invalid PNG header: ${file.name}`);
  }
  const width = bytes.readUInt32BE(16), height = bytes.readUInt32BE(20);
  if (!width || !height) throw new Error(`Invalid PNG dimensions: ${file.name}`);
  const entry = { path: relative, width, height };
  const sidecar = zip.file(`${file.name}.mcmeta`);
  if (sidecar) {
    entry.metadata = await sidecar.async("string");
    JSON.parse(entry.metadata);
  }
  entries.push({ ...entry, bytes });
}
if (!entries.length) throw new Error("Archive contains no Minecraft texture PNGs.");
for (const { path: relative, bytes, metadata } of entries) {
  const destination = path.join(target, relative);
  await fs.mkdir(path.dirname(destination), { recursive: true });
  await fs.writeFile(destination, bytes);
  if (metadata !== undefined) await fs.writeFile(`${destination}.mcmeta`, metadata);
}
await fs.writeFile(path.join(root, "src/logic/defaultTextures.json"), JSON.stringify(
  entries.map(({ bytes, ...entry }) => entry), null, 2,
) + "\n");
// Preserve the supplied archive's provenance without treating it as a license grant.
const provenance = zip.file("Texture-Packs.com.txt");
if (provenance) await fs.writeFile(path.join(target, "Texture-Packs.com.txt"), await provenance.async("nodebuffer"));
console.log(`Imported ${entries.length} PNG textures and ${entries.filter(({ metadata }) => metadata !== undefined).length} metadata files.`);
