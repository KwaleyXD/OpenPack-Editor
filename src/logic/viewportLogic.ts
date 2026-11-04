export interface Point {
  x: number;
  y: number;
}

export interface CanvasView {
  zoomLevel: number;
  panOffset: Point;
}

export const MAX_ZOOM = 16;

function assertView(view: CanvasView) {
  if (!Number.isFinite(view.zoomLevel) || view.zoomLevel <= 0 || view.zoomLevel > MAX_ZOOM ||
    !Number.isFinite(view.panOffset.x) || !Number.isFinite(view.panOffset.y)) {
    throw new RangeError("Canvas view needs finite offsets and a positive zoom no greater than 16.");
  }
}

export function getCanvasTransform(
  width: number, height: number,
  viewportWidth: number, viewportHeight: number,
  uiScale: number, view: CanvasView,
) {
  assertView(view);
  const scale = uiScale * view.zoomLevel;
  return {
    scale,
    x: (viewportWidth - width * scale) / 2 + view.panOffset.x,
    y: (viewportHeight - height * scale) / 2 + view.panOffset.y,
  };
}

export function zoomAtPoint(
  view: CanvasView, requestedZoom: number, cursor: Point, center: Point,
): CanvasView {
  assertView(view);
  if (![requestedZoom, cursor.x, cursor.y, center.x, center.y].every(Number.isFinite)) {
    throw new RangeError("Zoom and cursor coordinates must be finite.");
  }
  if (requestedZoom < 0) throw new RangeError("Zoom must not be negative.");
  // Only guard floating-point underflow; there is no user-facing zoom-out floor.
  const zoomLevel = Math.min(MAX_ZOOM, Math.max(Number.MIN_VALUE, requestedZoom));
  const ratio = zoomLevel / view.zoomLevel;
  return {
    zoomLevel,
    panOffset: {
      x: cursor.x - center.x - (cursor.x - center.x - view.panOffset.x) * ratio,
      y: cursor.y - center.y - (cursor.y - center.y - view.panOffset.y) * ratio,
    },
  };
}
