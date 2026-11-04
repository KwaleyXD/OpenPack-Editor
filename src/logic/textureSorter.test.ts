import { describe, expect, it } from "vitest";
import { sortTextures } from "./textureSorter";

const categoryExamples: ReadonlyArray<{
  category: string;
  filenames: readonly string[];
}> = [
  { category: "Swords", filenames: ["diamond_sword", "netherite_sword"] },
  { category: "Pickaxes", filenames: ["iron_pickaxe", "netherite_pickaxe"] },
  { category: "Axes", filenames: ["wooden_axe", "copper_axe"] },
  { category: "Shovels & Hoes", filenames: ["stone_shovel", "golden_hoe"] },
  {
    category: "Ranged & Magic",
    filenames: ["bow", "crossbow_pulling_0", "spectral_arrow", "trident", "mace"],
  },
  {
    category: "Misc Tools",
    filenames: [
      "fishing_rod", "shears", "flint_and_steel", "compass", "recovery_compass",
      "clock", "spyglass", "brush", "shield", "elytra", "totem_of_undying",
      "lead", "name_tag",
    ],
  },
  {
    category: "Armor & Trims",
    filenames: [
      "diamond_helmet", "chainmail_chestplate", "netherite_leggings",
      "leather_boots", "sentry_armor_trim_smithing_template",
      "netherite_upgrade_smithing_template", "coast_trim",
    ],
  },
  {
    category: "Earth & Soil",
    filenames: [
      "dirt", "grass_block_side", "podzol_top", "mycelium", "mud", "clay",
      "sand", "gravel",
    ],
  },
  {
    category: "Stone & Deepslate",
    filenames: [
      "stone", "cobblestone", "deepslate", "tuff", "calcite", "dripstone_block",
      "bedrock", "obsidian", "prismarine", "andesite", "diorite", "granite",
    ],
  },
  {
    category: "Wood & Logs",
    filenames: [
      "oak_log", "cherry_log", "mangrove_log", "poplar_log", "crimson_stem",
      "oak_wood", "warped_hyphae", "stripped_poplar_log_top",
    ],
  },
  {
    category: "Leaves & Foliage",
    filenames: [
      "poplar_leaves", "vine", "azalea_top", "leaf_litter", "waterlily",
    ],
  },
  {
    category: "Ores & Raw Metals",
    filenames: [
      "iron_ore", "deepslate_diamond_ore", "redstone_ore", "nether_quartz_ore",
      "copper_ore", "raw_iron", "raw_copper_block",
    ],
  },
  {
    category: "Plants & Fungi",
    filenames: [
      "chorus_flower", "red_mushroom", "tallgrass", "deadbush", "poplar_sapling",
      "fern", "big_dripleaf_top", "red_shrub", "shelf_mushroom", "chorus_plant",
      "cactus_side",
    ],
  },
  {
    category: "Crops (Blocks)",
    filenames: [
      "wheat_stage0", "carrots_stage3", "potatoes_stage1", "beetroots_stage2",
      "melon_top", "pumpkin_side", "sugar_cane", "bamboo",
    ],
  },
  {
    category: "Nether & End",
    filenames: [
      "netherrack", "soul_sand", "warped_nylium", "glowstone", "magma",
      "quartz_block_top", "basalt", "blackstone", "ancient_debris_side",
      "end_stone", "purpur_block", "shroomlight",
    ],
  },
  {
    category: "Stairs, Slabs & Walls",
    filenames: [
      "poplar_stairs", "cherry_slab", "mangrove_stairs", "cobblestone_wall",
      "white_wool_stairs", "red_concrete_slab", "blackstone_stairs",
    ],
  },
  {
    category: "Doors, Trapdoors & Fences",
    filenames: [
      "poplar_door_top", "cherry_trapdoor", "mangrove_fence", "copper_door",
      "nether_brick_fence",
    ],
  },
  { category: "Glass", filenames: ["glass", "red_stained_glass", "glass_pane_top"] },
  {
    category: "Copper & Metal Blocks",
    filenames: [
      "oxidized_copper", "iron_block", "gold_block", "emerald_block",
      "diamond_block", "netherite_block",
    ],
  },
  {
    category: "Concrete & Terracotta",
    filenames: ["red_concrete", "blue_concrete_powder", "terracotta", "white_glazed_terracotta"],
  },
  {
    category: "Redstone Components",
    filenames: [
      "redstone_dust", "piston_top", "dispenser_front", "dropper_front",
      "observer_top", "hopper", "repeater", "comparator", "daylight_detector_top",
      "lever", "stone_button", "oak_pressure_plate", "tripwire_hook",
      "tnt_side", "sculk",
    ],
  },
  {
    category: "Workstations & Utility",
    filenames: [
      "crafting_table_top", "crafter_top", "furnace_front", "smoker_side",
      "blast_furnace_top", "enchanting_table_top", "anvil", "brewing_stand",
      "cauldron", "beacon", "jukebox", "noteblock", "smithing_table_side",
      "loom", "cartography_table_top", "fletching_table", "grindstone_side",
      "stonecutter_top", "bell", "lodestone", "respawn_anchor", "decorated_pot",
    ],
  },
  {
    category: "Decor & Storage",
    filenames: [
      "red_bed", "cushion", "white_wool", "blue_carpet", "chest", "barrel",
      "shulker_box", "oak_sign", "banner", "painting", "item_frame",
      "flower_pot", "armor_stand", "lantern", "campfire", "chain", "bookshelf",
    ],
  },
  {
    category: "Food & Consumables",
    filenames: [
      "apple", "rabbit_stew", "bread", "porkchop", "cooked_fish",
      "beef", "chicken", "rotten_flesh", "cookie", "mutton", "rabbit",
      "pie", "cake", "kelp", "sweet_berries",
    ],
  },
  {
    category: "Vehicles",
    filenames: ["poplar_boat", "bamboo_raft", "chest_minecart"],
  },
  {
    category: "Materials & Drops",
    filenames: [
      "red_dye", "copper_ingot", "netherite_ingot", "iron_nugget", "diamond",
      "emerald", "coal", "stick", "string", "feather", "gunpowder", "flint",
      "leather", "brick", "paper", "book", "slime_ball", "egg", "ghast_tear",
      "blaze_rod", "blaze_powder", "magma_cream", "amethyst_shard", "end_crystal",
    ],
  },
  {
    category: "Music Discs & Magic",
    filenames: [
      "record_13", "potion", "splash_potion", "experience_bottle",
      "enchanted_book", "knowledge_book",
    ],
  },
  { category: "Spawn Eggs", filenames: ["chicken_spawn_egg", "rabbit_spawn_egg"] },
];

describe("sortTextures", () => {
  for (const { category, filenames } of categoryExamples) {
    it.each(filenames)(`groups %s.png in ${category}`, (filename) => {
      const filePath = `assets/minecraft/textures/block/${filename}.png`;
      expect(sortTextures([filePath])).toEqual([{ category, files: [filePath] }]);
    });

    it(`matches ${category} case-insensitively`, () => {
      const filePaths = filenames.map((filename) => `${filename.toUpperCase()}.PNG`);
      expect(sortTextures(filePaths)).toEqual([{ category, files: filePaths }]);
    });
  }

  it("groups matching texture filenames and preserves their input paths", () => {
    const files = [
      "assets/item/diamond_sword.png",
      "assets/block/oak_log.png",
      "assets/item/redstone_dust.png",
      "assets/block/oak_leaves.png",
      "assets/item/stone.png",
      "assets/item/golden_sword.PNG",
    ];

    expect(sortTextures(files)).toEqual([
      {
        category: "Swords",
        files: ["assets/item/diamond_sword.png", "assets/item/golden_sword.PNG"],
      },
      { category: "Wood & Logs", files: ["assets/block/oak_log.png"] },
      { category: "Redstone Components", files: ["assets/item/redstone_dust.png"] },
      { category: "Leaves & Foliage", files: ["assets/block/oak_leaves.png"] },
      { category: "Stone & Deepslate", files: ["assets/item/stone.png"] },
    ]);
  });

  it("matches filenames from Windows paths", () => {
    expect(sortTextures(["assets\\block\\birch_log.png"])).toEqual([
      { category: "Wood & Logs", files: ["assets\\block\\birch_log.png"] },
    ]);
  });

  it("returns no groups for an empty asset list", () => {
    expect(sortTextures([])).toEqual([]);
  });

  it("does not mutate the input list", () => {
    const files = Object.freeze(["assets/item/iron_sword.png"]);

    expect(sortTextures(files)).toEqual([
      { category: "Swords", files: ["assets/item/iron_sword.png"] },
    ]);
    expect(files).toEqual(["assets/item/iron_sword.png"]);
  });

  it("keeps unknown filenames and non-PNG assets in Other", () => {
    const files = [
      "unknown_texture.png",
      "stone.jpg",
      "oak_log.png.mcmeta",
      "redstone_dust.png.bak",
      "poplar_stairs.webp",
      "assets/stone/custom.png",
    ];

    expect(sortTextures(files)).toEqual([{ category: "Other", files }]);
  });

  it("requires exact names for misc tools", () => {
    expect(sortTextures(["custom_compass.png"])).toEqual([
      { category: "Other", files: ["custom_compass.png"] },
    ]);
  });

  it("gives the crop rule precedence for the shared melon keyword", () => {
    expect(sortTextures(["melon.png"])).toEqual([
      { category: "Crops (Blocks)", files: ["melon.png"] },
    ]);
  });
});
