export interface TextureGroup {
  category: string;
  files: string[];
}

const categoryRules: ReadonlyArray<{
  category: string;
  matches: (filename: string) => boolean;
}> = [
  {
    category: "Swords",
    matches: (filename) => /_sword\.png$/i.test(filename),
  },
  {
    category: "Wood Logs",
    matches: (filename) => /_log\.png$/i.test(filename),
  },
  {
    category: "Redstone",
    matches: (filename) => /^redstone_.*\.png$/i.test(filename),
  },
  {
    category: "Leaves",
    matches: (filename) => /_leaves\.png$/i.test(filename),
  },
];

function getFilename(assetPath: string): string {
  return assetPath.split(/[\\/]/).pop() ?? assetPath;
}

export function sortTextures(assetPaths: readonly string[]): TextureGroup[] {
  const grouped = new Map<string, string[]>();

  for (const assetPath of assetPaths) {
    const filename = getFilename(assetPath);
    const rule = categoryRules.find(({ matches }) => matches(filename));
    const category = rule?.category ?? "Other";
    const files = grouped.get(category) ?? [];

    files.push(assetPath);
    grouped.set(category, files);
  }

  return [...grouped].map(([category, files]) => ({ category, files }));
}
