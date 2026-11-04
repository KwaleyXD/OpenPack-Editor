import { usePackStore } from "../stores/packState";

export async function createNewPack(packName: string, description: string): Promise<void> {
  if (!packName.trim()) {
    throw new Error("Enter a name for the new pack.");
  }
  const store = usePackStore();
  try {
    window.localStorage.removeItem("openpack_save");
  } catch (error) {
    throw new Error(`Unable to clear the previous project save: ${error instanceof Error ? error.message : String(error)}`);
  }
  // loadTextures invalidates in-flight image requests using its monotonic request ID.
  store.initializeDefaultCategories();
  store.$patch({
    packName: packName.trim(),
    packDescription: description,
    packFormat: 34,
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
    throw new Error(`The new pack is open, but was not saved. ${store.persistenceError}`);
  }
}
