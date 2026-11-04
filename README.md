# OpenPack Studio

Desktop and browser Minecraft resource pack editor built with Vue, Pinia, Vite, Electron, and Tailwind CSS.

## Run locally

Use Node.js 22.22.2 or newer in the Node 22 line, or a supported newer Node release.

```sh
npm install
npm run dev
```

Open the localhost URL printed by Vite. In remote VS Code, forward that port
using the Ports tab.

## Desktop app (Windows .exe)

The desktop app is an Electron wrapper (`electron/main.cjs`) that serves the
built `dist/` folder from a private `app://openpack` origin.

```sh
npm run desktop   # build and open the desktop window on this machine
npm run dist:win  # build release/OpenPack-Studio-<version>-portable.exe
```

The portable `.exe` needs no installation. Double-click it to run it. Building
it works from Linux or WSL without Wine. Windows SmartScreen may warn about
the unsigned app; choose **More info → Run anyway**.

To build on GitHub, run the **Build Windows exe** workflow from the Actions tab,
or push a `v*` tag. Then download the `.exe` from the run's artifacts.

Autosaves are stored separately for the desktop app and the browser version, so
projects saved in one don't appear in the other.

## Vanilla textures

The supplied `26.3.x-Template.zip` has been imported into the default library:
**3,964 PNG textures** and **218 texture metadata sidecars**, including blocks,
items, entities, GUI sprites, fonts, particles, and all other texture folders.
New Pack populates the complete library; selecting an asset loads its original
pixels lazily (unchanged defaults are not copied into localStorage).

```text
public/vanilla_base/
├── item/
│   ├── diamond_sword.png
│   └── apple.png
└── block/
    ├── stone.png
    └── oak_log.png
```

The same structure also contains `entity/`, `gui/`, and other original folders.
These paths resolve as `/vanilla_base/item/diamond_sword.png`, for example.
The generated manifest records native width/height, so non-square textures and
larger images are not resampled to 16x16. Animated PNG strips open as full
sprite sheets, not animation playback; their original `.png.mcmeta` is retained
when the edited sheet is exported. Changing sheet dimensions may require
adjusting animation metadata externally.

To reimport a supplied template, run:

```sh
node scripts/import-default-textures.mjs /path/to/template.zip
```

This copies texture PNGs and their sidecars and regenerates
`src/logic/defaultTextures.json`; it does not import models, sounds, languages,
or replace the editor's pack metadata. The archive's provenance text is kept
in the texture library. Check applicable asset redistribution rights before
publishing or redistributing the bundled library.

Project edits are autosaved in this browser's localStorage under `openpack_save`.
Use the same browser and origin to restore them. Storage errors appear in the
right panel. Cached edited textures can be reopened without their source PNGs.

ZIP exports currently use legacy pack format 34; that is not a guarantee of
compatibility with Minecraft 26.3. The export engine accepts a format override.

## Drawing and colors

Scroll over the workspace to zoom, centered on the cursor, with no zoom-out
floor (zooming in is capped at 1600%). Trackpad pinch is supported too.
Hold **Space and drag** or use a
**middle-button drag** to pan. Corner buttons show the zoom and reset the view.
Navigation never changes pixels or history. The canvas and minimap use an
alpha checkerboard that is not baked into PNG exports.
The pixel under the cursor is highlighted with a lighter overlay; it does not
modify the texture or appear in exports.
The sidebar preview fills the available width while preserving aspect ratio
(very tall sheets are height-bounded). Click it to open a large, live,
grid-free preview; Escape or the close button returns to editing.

The left action bar has **Create new pack** and **Resize canvas**:

- New Pack accepts a name and description, loads the complete default asset tree, and
  initializes a fresh 16x16 canvas. Confirmation is required to replace the
  current project and its local save. Custom palettes are kept.
- Resize supports separate width/height, an aspect-ratio lock, and custom
  sizes including 16, 32, and 64. With **Resize content** enabled it scales
  every active-texture layer using nearest neighbors. Otherwise it crops or
  pads with transparent pixels using a nine-point anchor. Center offsets are
  rounded down when the dimension difference is odd. Resize is one undo step.

The right panel provides pencil, eraser, bucket, Fill All, eyedropper, line, rectangle,
ellipse, and checkerboard dither tools. Drag to preview a shape, then release
to commit it as one undo step. Right-click or right-drag temporarily erases
without changing the selected tool.
**Fill All** replaces every pixel matching the clicked color on the active
layer, including disconnected regions (or all transparent pixels when clicked).
Unlike the bucket, it is not limited to connected areas. It leaves other colors
and other layers unchanged, even when mirror mode is enabled.
Escape cancels a preview. Toggle **Filled shapes**
for solid rectangles/ellipses and **Mirror left/right** or **Mirror top/bottom**
for symmetry. Dither marks are mirrored as a unit, so reflected marks may land
on the opposite checkerboard parity.

Choose Earth & stone, Wool & concrete, or Ore highlights palettes. The recent
color bar keeps ten unique colors for this session. Hex input accepts six RGB
or eight RGBA digits, with or without `#`; RGBA inputs use integer bytes
from 0 to 255. The native RGB picker preserves the existing alpha channel.
Fully opaque colors use a canonical six-digit form in recent-color history.

To save a custom palette, choose your colors, enter a name, and click
**Save recent colors as palette**. It saves the active color and recent colors
under `openpack_palettes` in localStorage, independently of the project save.
Saved palettes appear in the preset selector; storage errors are shown in the
color panel. Clearing site data removes both project saves and custom palettes.

## Validate and build

```sh
npm test
npm run typecheck
npm run build
npm run preview
```
