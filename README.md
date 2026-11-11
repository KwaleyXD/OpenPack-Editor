# OpenPack Studio

Desktop and browser Minecraft resource pack editor built with Vue, Pinia, Vite, Electron, and Tailwind CSS.

## Web version

Test and use the editor directly in your browser without any installation:
[https://openpack-editor.vercel.app/](https://openpack-editor.vercel.app/)

## Run locally

Use Node.js 22.22.2 or newer in the Node 22 line, or a supported newer Node release.

```sh
npm install
npm run dev
```

Open the localhost URL printed by Vite. In remote VS Code, forward that port
using the Ports tab.

## Desktop app (Windows .exe)

For most users, downloading the portable Windows `.exe` from
[Releases](https://github.com/KwaleyXD/OpenPack-Editor/releases/latest) is
recommended. The latest release is **v0.1.4**.

To build or run the desktop app from source:

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
larger images are not resampled to 16x16.

Sorting searches the whole filename, case-insensitively. Logs and crimson/warped
stems go to **Wood & Logs**; shelf, candle, coral, plank, end, spear, and trim
names have dedicated categories. Rails go to **Redstone Components**, eggs to
**Spawn Eggs & Eggs**, and amethyst to **Ores**. Unspecialized diamond, iron,
copper, gold, coal, emerald, redstone, lapis (or lapiz) names also go to **Ores**;
tools, armor, food, and other specific categories take precedence over this
material fallback. Trims are separate from armor. Existing local saves are
regrouped automatically without discarding edited textures.

Use **Search textures** at the top of the asset explorer to filter by filename
or path (case-insensitive). Matches stay in their original expandable categories;
categories without matches are hidden. Category progress still counts all its
textures. **Clear** restores the full list and preserves expanded categories.

Textures with `.png.mcmeta` animation data appear as one expandable asset.
Click **+** beside the texture to see its frames, then select a frame to edit it.
The list follows the metadata's playback order (including repeats) and shows
each frame's duration in game ticks. Tall textures without animation metadata
remain ordinary images. Frame selection does not add undo steps.

Frame edits, layers, undo/redo, and autosave retain the full original sprite
sheet. Exports contain one sheet plus its animation metadata, preserving frame
order, timing, interpolation, and other metadata. Resizing uses frame dimensions
and resizes every physical cell together; exported frame dimensions are updated
automatically. Frames are selectable for editing, not played automatically.

The numbered clock, compass, and recovery compass item textures also appear as
expandable frame groups, ordered by their numeric suffix. They remain separate
textures: selecting a frame edits that PNG, and exports retain the original
filenames. Onion skin shows neighboring frames, including saved edits. Resizing
affects only the selected numbered frame; neighboring frames must have matching
dimensions for onion skinning. Frame switches reset the selected texture's undo
history, as with other separate textures.

To restore an edited texture, select it and choose **Reset texture to default**
in the right-hand preview panel. Confirming discards its edits and layers,
restores the original dimensions, removes it from the exported edits, and clears
its undo history. This cannot be undone. Sprite-sheet animations reset all
their frames; numbered clock and compass frames are reset individually.

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

Use **Rectangular selection** to drag a selection, or **Magic wand selection**
to select orthogonally connected pixels of the same color (including transparent
pixels) on the active layer. Use **Copy** / **Paste** or Ctrl/Cmd+C and
Ctrl/Cmd+V to copy between sprites and animation frames. The clipboard is
internal to the running editor; it does not exchange images with other apps.
Paste starts in the top-left corner of the active layer and selects the pasted
pixels. Choose **Move selection** and drag the selection to reposition it;
paste automatically selects the Move tool. Transparent copied pixels do not
overwrite the destination. A selection larger than the destination frame cannot
be pasted. Moves stay inside the frame.

Each move is undoable; a paste and its repositioning are one undo step until
you switch tools or deselect. Use **Deselect selection**, Ctrl/Cmd+D, or Escape
to clear a selection; the selection tools can also replace it directly.
Escape also cancels an active drag. Selections clear when changing sprites,
frames, layers, or undoing, while copied pixels remain available until the
editor closes. The active layer must be visible to paste or move.

The asset explorer shows lazy-loaded texture thumbnails, with live composites
for active and previously edited textures. Drag the dividers beside the canvas
to resize either sidebar. The left action bar starts at 64 pixels wide and has
its own divider between the action buttons and asset explorer; drag it to set
a width from 56 to 240 pixels (limited by available window space). All sidebar
widths are saved locally. Preview and layer-list
heights also have draggable dividers. Focus a divider and use arrow keys
(Shift for larger steps), Home, or End to resize with the keyboard.
Each layer has an opacity slider beside its visibility control. Opacity is
saved with the project, can be undone, and applies to previews and PNG exports.

The supplied program logo is used in the header, browser tab, desktop window,
and Windows executable.

Scroll over the workspace to zoom, centered on the cursor, with no zoom-out
floor (zooming in is capped at 1600%). Trackpad pinch is supported too.
Hold **Space and drag** or use a
**middle-button drag** to pan. Corner buttons show the zoom and reset the view.
Navigation never changes pixels or history. The canvas and minimap use an
alpha checkerboard that is not baked into PNG exports.
The **Grid** button toggles subtle dark pixel outlines without changing texture
pixels. Outlines disappear below four screen pixels per cell, and never appear
in previews or exports.
**Tile** shows a 3×3 repetition of the current frame to check texture seams.
Use the tile opacity slider to fade the surrounding tiles over the checkerboard:
100% shows them fully and 0% hides them. Only the center tile is editable.
Tile mode is a workspace view and does not change previews or exports.
It fits the repeated view on entry, and restores the previous zoom and pan on exit.
Fast pencil, eraser, and dither strokes connect successive input positions so
quick drags do not leave holes. Redraw requests are batched to animation frames;
pan/zoom updates do not retraverse the reactive layer data.
Live previews share a single pixel-change notification, and brush movement
does not repeatedly traverse the full asset library for autosave.
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

The right panel provides pencil, eraser, bucket, Fill All, eyedropper, a Lighten / Darken
shading brush, line, rectangle, ellipse, and checkerboard dither tools. Choose
whether the shading brush lightens or darkens from the tool controls; it preserves pixel
transparency, supports symmetry, and shades each pixel once per drag. Drag to
preview a shape, then release to commit it as one undo step. Right-click or
right-drag temporarily erases
without changing the selected tool.
**Fill All** replaces every pixel matching the clicked color on the active
layer, including disconnected regions (or all transparent pixels when clicked).
Unlike the bucket, it is not limited to connected areas. It leaves other colors
and other layers unchanged, even when mirror mode is enabled.
Escape cancels a preview. Toggle **Filled shapes**
for solid rectangles/ellipses and **Mirror left/right** or **Mirror top/bottom**
for symmetry. Dither marks are mirrored as a unit, so reflected marks may land
on the opposite checkerboard parity.

All visible layers are composited normally; onion skin no longer ghosts layers.
For animated textures, **Onion skin** controls neighboring playback frames:
**0** off, **1** previous, **2** previous and next, **3** next. Neighbors are
translucent overlays in the workspace only, never in previews or exports.
The first frame has no previous neighbor and the last has no next neighbor
(no wrapping). Non-animated textures have no onion-skin overlays.

Choose Earth & stone, Wool & concrete, or Ore highlights palettes. The recent
color bar keeps ten unique colors for this session. Hex input accepts six RGB
or eight RGBA digits, with or without `#`; RGBA inputs use integer bytes
from 0 to 255. The native RGB picker preserves the existing alpha channel.
Custom picker adjustments are added to recent colors only when the selection
is confirmed, so dragging through shades does not replace the recent-color row.
Fully opaque colors use a canonical six-digit form in recent-color history.

To save a custom palette, choose your colors, enter a name, and click
**Save recent colors as palette**. It saves the active color and recent colors
under `openpack_palettes` in localStorage, independently of the project save.
Saved palettes appear in the expandable **Custom palettes** list. Collapse the
list to hide it without changing the selected colors; storage errors are shown in the
color panel. Clearing site data removes both project saves and custom palettes.

## Validate and build

```sh
npm test
npm run typecheck
npm run build
npm run preview
```
