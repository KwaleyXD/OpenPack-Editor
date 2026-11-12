import JSZip from "jszip";

const DATABASE_NAME = "openpack-source-packs";
const STORE_NAME = "archives";
const archiveCache = new Map<string, Promise<JSZip>>();

interface StoredArchive {
  id: string;
  blob: Blob;
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(STORE_NAME, { keyPath: "id" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new Error(`Unable to open imported pack storage: ${request.error?.message ?? "unknown error"}`));
  });
}

async function writeArchive(
  action: { type: "put"; record: StoredArchive } | { type: "delete"; id: string },
): Promise<void> {
  const database = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, "readwrite");
      if (action.type === "put") transaction.objectStore(STORE_NAME).put(action.record);
      else transaction.objectStore(STORE_NAME).delete(action.id);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(new Error(`Unable to save imported pack: ${transaction.error?.message ?? "unknown error"}`));
      transaction.onabort = () => reject(new Error(`Unable to save imported pack: ${transaction.error?.message ?? "transaction aborted"}`));
    });
  } finally {
    database.close();
  }
}

export async function saveSourcePack(id: string, blob: Blob): Promise<void> {
  archiveCache.delete(id);
  await writeArchive({ type: "put", record: { id, blob } });
}

export async function getSourcePack(id: string): Promise<Blob> {
  const database = await openDatabase();
  try {
    return await new Promise<Blob>((resolve, reject) => {
      const request = database.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME).get(id);
      request.onsuccess = () => {
        const record = request.result as StoredArchive | undefined;
        if (!record?.blob) {
          reject(new Error("The imported pack source is missing from this browser's storage. Reimport the ZIP to continue."));
          return;
        }
        resolve(record.blob);
      };
      request.onerror = () => reject(new Error(`Unable to read imported pack storage: ${request.error?.message ?? "unknown error"}`));
    });
  } finally {
    database.close();
  }
}

export async function getSourcePackZip(id: string): Promise<JSZip> {
  let zip = archiveCache.get(id);
  if (!zip) {
    zip = getSourcePack(id).then((blob) => JSZip.loadAsync(blob));
    archiveCache.set(id, zip);
    zip.catch(() => archiveCache.delete(id));
  }
  return zip;
}

export async function getSourceTextureBlob(id: string, path: string): Promise<Blob> {
  const zip = await getSourcePackZip(id);
  const file = zip.file(path);
  if (!file) {
    throw new Error(`The imported pack is missing "${path}". Reimport the ZIP to continue.`);
  }
  return new Blob([await file.async("arraybuffer")], { type: "image/png" });
}

export async function deleteSourcePack(id: string): Promise<void> {
  archiveCache.delete(id);
  await writeArchive({ type: "delete", id });
}
