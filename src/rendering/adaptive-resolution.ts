const INITIAL_PIXEL_BUDGET = 1920 * 1080;
const SAMPLE_SECONDS = 1.5;
const RECOVERY_SECONDS = 10;

/** Sustained frame pacing controls only the 3D buffer, never simulation or HTML. */
export class AdaptiveResolution {
  private ratio = 1;
  private minimum = 0.75;
  private maximum = 1;
  private elapsed = 0;
  private frames = 0;
  private stableSeconds = 0;
  private cooldown = 1;

  get pixelRatio(): number { return this.ratio; }
  get nativePixelRatio(): number { return this.maximum; }

  configure(width: number, height: number, devicePixelRatio: number): number {
    this.maximum = Math.min(2, Math.max(0.5, devicePixelRatio));
    // Retina keeps at least one drawing-buffer pixel per CSS pixel. Standard
    // density screens can trade a little sharpness for a playable frame rate.
    this.minimum = Math.min(1, this.maximum * 0.75);
    this.ratio = Math.max(this.minimum, Math.min(this.maximum,
      Math.sqrt(INITIAL_PIXEL_BUDGET / Math.max(1, width * height))));
    this.resetSamples();
    return this.ratio;
  }

  /** Returns a new ratio only when a buffer resize is warranted. dt is seconds. */
  update(dt: number, visible = true): number | null {
    // Background throttling, debugger pauses and isolated long tasks must not
    // drive quality down. Give buffers time to settle after a resize as well.
    if (!visible || !Number.isFinite(dt) || dt <= 0 || dt >= 0.1) {
      this.resetSamples();
      return null;
    }
    if (this.cooldown > 0) {
      this.cooldown -= dt;
      return null;
    }
    this.elapsed += dt;
    this.frames++;
    if (this.elapsed < SAMPLE_SECONDS) return null;

    const elapsed = this.elapsed;
    const average = elapsed / this.frames;
    this.elapsed = this.frames = 0;
    let next = this.ratio;
    if (average > 1 / 58) {
      this.stableSeconds = 0;
      // Pixel cost follows area. Small bounded steps avoid conspicuous jumps.
      next *= Math.max(0.85, Math.min(0.97, Math.sqrt((1 / 62) / average)));
    } else if (average <= 1 / 59) {
      this.stableSeconds += elapsed;
      if (this.stableSeconds >= RECOVERY_SECONDS) {
        this.stableSeconds = 0;
        // Probe upward slowly: a 60 Hz display cannot reveal spare GPU time.
        next *= 1.04;
      }
    } else {
      this.stableSeconds = 0;
    }
    next = Math.max(this.minimum, Math.min(this.maximum, next));
    if (Math.abs(next - this.ratio) < 0.01) return null;
    this.ratio = next;
    this.cooldown = 1;
    return next;
  }

  private resetSamples(): void {
    this.elapsed = this.frames = this.stableSeconds = 0;
    this.cooldown = 1;
  }
}
