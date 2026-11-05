import type { Animator } from "./Animator";

export type SheetImage = HTMLImageElement | HTMLCanvasElement | ImageBitmap | OffscreenCanvas;

/** An image cut into a grid of equal frames, numbered left to right, top to bottom. */
export class SpriteSheet {
  public readonly image: SheetImage;
  public readonly frameWidth: number;
  public readonly frameHeight: number;
  public readonly columns: number;
  public readonly frameCount: number;

  constructor(image: SheetImage, frameWidth: number, frameHeight: number) {
    this.image = image;
    this.frameWidth = frameWidth;
    this.frameHeight = frameHeight;
    this.columns = Math.floor(image.width / frameWidth);
    this.frameCount = this.columns * Math.floor(image.height / frameHeight);
    if (this.frameCount === 0) throw new Error("The image is smaller than one frame");
  }

  /** Where a frame is in the image, in pixels. */
  public frameRect(frame: number): { x: number; y: number } {
    if (!Number.isInteger(frame) || frame < 0 || frame >= this.frameCount) {
      throw new Error(`Frame ${frame} is outside the sheet (${this.frameCount} frames)`);
    }
    return { x: (frame % this.columns) * this.frameWidth, y: Math.floor(frame / this.columns) * this.frameHeight };
  }
}

/** Loads an image and cuts it into frames. It rejects if the image can't be loaded. */
export function loadSpriteSheet(url: string, frameWidth: number, frameHeight: number): Promise<SpriteSheet> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(new SpriteSheet(image, frameWidth, frameHeight));
    image.onerror = () => reject(new Error(`Could not load the sprite sheet "${url}"`));
    image.src = url;
  });
}

export interface SpriteOptions {
  sheet: SpriteSheet;
  /** Chooses the frame. Without it, the sprite shows `frame`. */
  animator?: Animator;
  /** The frame to show without an animator. Default: 0. */
  frame?: number;
  /** Size on screen, in meters. */
  width: number;
  height: number;
  /** Moves the image from the body's center, in meters (Y up). Default: (0, 0). */
  offsetX?: number;
  offsetY?: number;
  /** Mirror horizontally. A function is read on every draw. Default: false. */
  flipX?: boolean | (() => boolean);
  /** Blend pixels when scaling. Keep it off for pixel art. Default: false. */
  smooth?: boolean;
}

/** An image drawn in place of an entity's `draw()`. Set it with `entity.setSprite()`. */
export class Sprite {
  public readonly animator: Animator | undefined;
  private readonly options: SpriteOptions;

  constructor(options: SpriteOptions) {
    this.options = options;
    this.animator = options.animator;
    // Fail now, not on the first draw.
    options.sheet.frameRect(options.frame ?? 0);
    for (const frame of options.animator?.allFrames ?? []) options.sheet.frameRect(frame);
  }

  /** Changes the mirroring. */
  public setFlipX(flipX: boolean | (() => boolean)): void {
    this.options.flipX = flipX;
  }

  /** Draws at a position in canvas pixels. `angle` is the body's rotation, in radians. */
  public draw(ctx: CanvasRenderingContext2D, px: number, py: number, angle: number, scale: number): void {
    const { sheet, width, height, offsetX = 0, offsetY = 0, flipX = false, smooth = false } = this.options;
    const { x, y } = sheet.frameRect(this.animator?.frame ?? this.options.frame ?? 0);
    const flip = typeof flipX === "function" ? flipX() : flipX;
    const w = width * scale;
    const h = height * scale;
    ctx.save();
    ctx.imageSmoothingEnabled = smooth;
    ctx.translate(px, py);
    ctx.rotate(-angle); // canvas Y is flipped → flip rotation
    ctx.translate(offsetX * scale, -offsetY * scale);
    if (flip) ctx.scale(-1, 1);
    ctx.drawImage(sheet.image, x, y, sheet.frameWidth, sheet.frameHeight, -w / 2, -h / 2, w, h);
    ctx.restore();
  }
}
