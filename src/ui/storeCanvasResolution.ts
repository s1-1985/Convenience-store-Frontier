export interface CanvasDisplaySize {
  width: number;
  height: number;
}

export interface CanvasResolution extends CanvasDisplaySize {
  pixelRatio: number;
  backingWidth: number;
  backingHeight: number;
}

export function resolveCanvasPixelRatio(value: number, maximum = 3): number {
  if (!Number.isFinite(value) || value <= 0) return 1;
  return Math.max(1, Math.min(maximum, value));
}

export function calculateCanvasDisplaySize(
  availableWidth: number,
  availableHeight: number,
  logicalWidth: number,
  logicalHeight: number,
): CanvasDisplaySize {
  if (
    availableWidth <= 0 ||
    availableHeight <= 0 ||
    logicalWidth <= 0 ||
    logicalHeight <= 0
  ) {
    return {
      width: Math.max(0, Math.round(availableWidth)),
      height: Math.max(0, Math.round(availableHeight)),
    };
  }
  const aspect = logicalWidth / logicalHeight;
  let width = availableWidth;
  let height = width / aspect;
  if (height > availableHeight) {
    height = availableHeight;
    width = height * aspect;
  }
  return {
    width: Math.max(1, Math.round(width)),
    height: Math.max(1, Math.round(height)),
  };
}

export function configureHiDpiCanvas(
  canvas: HTMLCanvasElement,
  context: CanvasRenderingContext2D,
  logicalWidth: number,
  logicalHeight: number,
  requestedPixelRatio = window.devicePixelRatio || 1,
): CanvasResolution {
  const pixelRatio = resolveCanvasPixelRatio(requestedPixelRatio);
  const parentBounds = canvas.parentElement?.getBoundingClientRect();
  const availableWidth = parentBounds?.width ?? logicalWidth;
  const availableHeight = parentBounds?.height ?? logicalHeight;
  const display = calculateCanvasDisplaySize(
    availableWidth,
    availableHeight,
    logicalWidth,
    logicalHeight,
  );
  const backingWidth = Math.max(1, Math.round(logicalWidth * pixelRatio));
  const backingHeight = Math.max(1, Math.round(logicalHeight * pixelRatio));

  if (canvas.width !== backingWidth) canvas.width = backingWidth;
  if (canvas.height !== backingHeight) canvas.height = backingHeight;
  canvas.style.width = `${display.width}px`;
  canvas.style.height = `${display.height}px`;
  context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";

  return {
    ...display,
    pixelRatio,
    backingWidth,
    backingHeight,
  };
}
