export interface TextureGroup {
  category: string;
  files: string[];
}

const priorityRules: ReadonlyArray<{
  category: string;
  matches: (filename: string) => boolean;
}> = [
  { category: "Wood & Logs", matches: (name) => /(?:log|warped_stem|crimson_stem).*\.png$/i.test(name) },
  { category: "Shelf", matches: (name) => /shelf.*\.png$/i.test(name) },
  { category: "Candle", matches: (name) => /candle.*\.png$/i.test(name) },
  { category: "Coral", matches: (name) => /coral.*\.png$/i.test(name) },
  { category: "Planks", matches: (name) => /plank.*\.png$/i.test(name) },
  { category: "End Stuff", matches: (name) => /end.*\.png$/i.test(name) },
  { category: "Spear", matches: (name) => /spear.*\.png$/i.test(name) },
  { category: "Trims", matches: (name) => /trim.*\.png$/i.test(name) },
  { category: "Redstone Components", matches: (name) => /rail.*\.png$/i.test(name) },
  { category: "Ores", matches: (name) => /amethyst.*\.png$/i.test(name) },
  { category: "Spawn Eggs & Eggs", matches: (name) => /egg.*\.png$/i.test(name) && !/leggings/i.test(name) },
];

const categoryRules: typeof priorityRules = [
  ...priorityRules,
  {
    category: "Music Discs & Magic",
    matches: (filename) =>
      /(?:record_|potion|experience_bottle|enchanted_book|knowledge_book).*\.png$/i.test(filename),
  },
  {
    category: "Swords",
    matches: (filename) => /sword.*\.png$/i.test(filename),
  },
  {
    category: "Pickaxes",
    matches: (filename) => /pickaxe.*\.png$/i.test(filename),
  },
  {
    category: "Axes",
    matches: (filename) => /axe.*\.png$/i.test(filename),
  },
  {
    category: "Shovels & Hoes",
    matches: (filename) => /(?:shovel|hoe).*\.png$/i.test(filename),
  },
  {
    category: "Misc Tools",
    matches: (filename) =>
      /(?:fishing_rod|shears|flint_and_steel|compass|recovery_compass|clock|spyglass|brush|shield|elytra|totem_of_undying|lead|name_tag).*\.png$/i.test(filename),
  },
  {
    category: "Armor",
    matches: (filename) =>
      /(?:helmet|chestplate|leggings|boots|smithing_template).*\.png$/i.test(filename),
  },
  {
    category: "Ranged & Magic",
    matches: (filename) => /(?:bow|arrow|trident|mace).*\.png$/i.test(filename),
  },
  {
    category: "Vehicles",
    matches: (filename) => /(?:^|_)(?:boat|raft|minecart)(?:_|\.png$)/i.test(filename),
  },
  {
    category: "Stairs, Slabs & Walls",
    matches: (filename) => /(?:stairs|slab|wall).*\.png$/i.test(filename),
  },
  {
    category: "Doors, Trapdoors & Fences",
    matches: (filename) => /(?:door|trapdoor|fence).*\.png$/i.test(filename),
  },
  {
    category: "Glass",
    matches: (filename) => /glass.*\.png$/i.test(filename),
  },
  {
    category: "Ores",
    matches: (filename) => /(?:_ore|raw_).*\.png$/i.test(filename),
  },
  {
    category: "Workstations & Utility",
    matches: (filename) =>
      /(?:crafting_table|crafter|furnace|smoker|blast_furnace|enchanting_table|anvil|brewing_stand|cauldron|beacon|jukebox|noteblock|smithing_table|loom|cartography_table|fletching_table|grindstone|stonecutter|bell|lodestone|respawn_anchor|decorated_pot).*\.png$/i.test(filename),
  },
  {
    category: "Redstone Components",
    matches: (filename) =>
      /(?:redstone|piston|dispenser|dropper|observer|hopper|repeater|comparator|daylight_detector|lever|button|pressure_plate|tripwire|tnt|sculk).*\.png$/i.test(filename),
  },
  {
    category: "Wood & Logs",
    matches: (filename) =>
      /(?:wood|hyphae|stripped_).*\.png$/i.test(filename),
  },
  {
    category: "Leaves & Foliage",
    matches: (filename) =>
      /(?:leaves|vine|azalea|leaf_litter|waterlily).*\.png$/i.test(filename),
  },
  {
    category: "Concrete & Terracotta",
    matches: (filename) =>
      /(?:concrete|terracotta|glazed_terracotta).*\.png$/i.test(filename),
  },
  {
    category: "Materials & Drops",
    matches: (filename) => !/(?:diamond|iron|copper|gold|coal|emerald|redstone|lapis|lapiz)/i.test(filename) &&
      /(?:dye|ingot|nugget|stick|string|feather|gunpowder|flint|leather|brick|paper|book|slime_ball|tear|rod|powder|cream|shard|crystal).*\.png$/i.test(filename),
  },
  { category: "Ores", matches: (filename) => /netherite_block.*\.png$/i.test(filename) },
  {
    category: "Nether & End",
    matches: (filename) =>
      /(?:nether|soul_|nylium|glowstone|magma|quartz|basalt|blackstone|ancient_debris|end_stone|purpur|shroomlight).*\.png$/i.test(filename),
  },
  {
    category: "Earth & Soil",
    matches: (filename) =>
      /(?:dirt|grass_block|podzol|mycelium|mud|clay|sand|gravel).*\.png$/i.test(filename),
  },
  {
    category: "Stone & Deepslate",
    matches: (filename) =>
      /(?:stone|cobblestone|deepslate|tuff|calcite|dripstone|bedrock|obsidian|prismarine|andesite|diorite|granite).*\.png$/i.test(filename),
  },
  {
    category: "Decor & Storage",
    matches: (filename) =>
      /(?:bed|cushion|wool|carpet|chest|barrel|shulker_box|sign|banner|painting|item_frame|flower_pot|armor_stand|lantern|campfire|chain|bookshelf).*\.png$/i.test(filename),
  },
  {
    category: "Plants & Fungi",
    matches: (filename) =>
      /(?:flower|mushroom|tallgrass|deadbush|sapling|fern|dripleaf|red_shrub|shelf_mushroom|chorus|cactus).*\.png$/i.test(filename),
  },
  {
    category: "Crops (Blocks)",
    matches: (filename) =>
      /(?:wheat|carrot|potato|beetroot|melon|pumpkin|sugar_cane|bamboo).*\.png$/i.test(filename),
  },
  {
    category: "Food & Consumables",
    matches: (filename) =>
      /(?:apple|stew|bread|porkchop|fish|beef|chicken|rotten_flesh|cookie|melon|mutton|rabbit|pie|cake|kelp|berries).*\.png$/i.test(filename),
  },
  {
    category: "Ores",
    matches: (filename) => /(?:diamond|iron|copper|gold|coal|emerald|redstone|lapis|lapiz|netherite_block).*\.png$/i.test(filename),
  },
];

function getFilename(assetPath: string): string {
  return assetPath.split(/[\\/]/).pop() ?? assetPath;
}

export function getCategoryId(categoryName: string): string {
  return categoryName.toLowerCase().replace(/[^a-z0-9]+/g, "-");
}

export function sortTextures(assetPaths: readonly string[]): TextureGroup[] {
  const grouped = new Map<string, string[]>();

  for (const assetPath of assetPaths) {
    const filename = getFilename(assetPath);
    const folders = assetPath.replace(/\\/g, "/")
      .replace(/^assets\/[a-z0-9_.-]+\/textures\//, "")
      .replace(/^assets\/minecraft\/textures\//, "").split("/");
    const folder = folders.length > 1 ? folders[0] : "";
    const rule = categoryRules.find(({ matches }) => matches(filename));
    const category = /(?:^|\/)trims?\//i.test(assetPath.replace(/\\/g, "/")) ? "Trims"
      : rule && priorityRules.includes(rule) ? rule.category
      : folder && folder !== "item" && folder !== "block" && folder !== "assets"
      ? `${folder === "gui" ? "GUI" : folder.split("_").map((part) => part[0].toUpperCase() + part.slice(1)).join(" ")} Textures`
      : rule?.category ?? "Other";
    const files = grouped.get(category) ?? [];

    files.push(assetPath);
    grouped.set(category, files);
  }

  return [...grouped].map(([category, files]) => ({ category, files }));
}
