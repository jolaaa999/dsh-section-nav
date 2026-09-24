export type RailMode = "full" | "compact" | "hidden";

export interface RailPosition {
  left: number;
  mode: RailMode;
  width: number;
}

export interface PositionManagerOptions {
  onPositionChange(position: RailPosition): void;
}

interface ModeConfiguration {
  gap: number;
  mode: Exclude<RailMode, "hidden">;
  minWidth: number;
  maxWidth: number;
}

/** Space kept between the rail and the viewport's right edge. */
const VIEWPORT_SAFE_AREA = 24;
/** Clearance past the target's right edge for DSH's transcript width handle. */
const WIDTH_HANDLE_CLEARANCE = 36;
/** Distance kept from the viewport's right edge by an edge-pinned rail. */
const EDGE_INSET = 10;

/**
 * Gaps clear the right transcript width handle: its strip starts 24px past the
 * message column and is up to 10px wide, so the rail must start at least 34px
 * past the column, plus breathing room.
 *
 * Widths are ranges, not fixed widths: a wide window lets the full rail grow
 * into the free gutter instead of clipping every title at 172px.
 */
const FULL_MODE: ModeConfiguration = { gap: 56, mode: "full", minWidth: 200, maxWidth: 420 };
const COMPACT_MODE: ModeConfiguration = { gap: 44, mode: "compact", minWidth: 132, maxWidth: 300 };

export const HIDDEN_RAIL_POSITION: RailPosition = {
  left: 0,
  mode: "hidden",
  width: 0,
};

function positionsEqual(first: RailPosition, second: RailPosition): boolean {
  return (
    first.left === second.left &&
    first.mode === second.mode &&
    first.width === second.width
  );
}

/**
 * Narrowest rail pinned to the viewport's right edge.
 *
 * The rail never collapses into a marker strip, so a window too narrow for a
 * gutter still shows titled entries at their minimum width, clamped to what
 * the viewport can hold.
 * @param viewportWidth - Layout viewport width in CSS pixels.
 * @returns Edge-pinned compact rail position.
 */
export function initialRailPosition(viewportWidth: number): RailPosition {
  const width = Math.min(COMPACT_MODE.maxWidth, viewportWidth - EDGE_INSET * 2);
  return {
    left: Math.max(EDGE_INSET, Math.round(viewportWidth - width - EDGE_INSET)),
    mode: "compact",
    width: Math.max(COMPACT_MODE.minWidth, width),
  };
}

function getPreferredModes(): readonly ModeConfiguration[] {
  return [FULL_MODE, COMPACT_MODE];
}

export class PositionManager {
  private animationFrameId: number | null = null;
  private currentPosition = HIDDEN_RAIL_POSITION;
  private resizeObserver: ResizeObserver | null = null;
  private layoutObserver: ResizeObserver | null = null;
  private started = false;
  private target: HTMLElement | null = null;
  private layoutTarget: HTMLElement | null = null;

  constructor(private readonly options: PositionManagerOptions) {}

  start(): void {
    if (this.started) {
      return;
    }

    this.started = true;
    document.addEventListener("transitionrun", this.handleLayoutChange, true);
    document.addEventListener("transitionend", this.handleLayoutChange, true);
    document.addEventListener("pointerup", this.handleLayoutChange, true);
    document.addEventListener("pointercancel", this.handleLayoutChange, true);
    window.addEventListener("resize", this.handleLayoutChange, { passive: true });
    this.resizeObserver = new ResizeObserver(this.handleLayoutChange);
    this.layoutObserver = new ResizeObserver(this.handleLayoutChange);
    this.scheduleUpdate();
  }

  /**
   * Re-evaluate the rail position on the next animation frame.
   *
   * Callers use this after a layout gesture that can move or resize the target
   * without necessarily resizing the observed element itself.
   */
  refresh(): void {
    this.scheduleUpdate();
  }

  setTarget(target: HTMLElement | null): void {
    if (this.target === target) {
      this.scheduleUpdate();
      return;
    }

    this.resizeObserver?.disconnect();
    this.target = target;

    if (target) {
      this.resizeObserver?.observe(target);
    }

    this.scheduleUpdate();
  }

  /**
   * Observe a wider conversation container so rail positioning also follows
   * layout shifts that move the message column without changing its width.
   * @param target - scrollport or chat container, or null to observe nothing.
   */
  setLayoutTarget(target: HTMLElement | null): void {
    if (this.layoutTarget === target) {
      this.scheduleUpdate();
      return;
    }

    this.layoutObserver?.disconnect();
    this.layoutTarget = target;

    if (target) {
      this.layoutObserver?.observe(target);
    }

    this.scheduleUpdate();
  }

  destroy(): void {
    if (!this.started) {
      return;
    }

    this.started = false;
    document.removeEventListener("transitionrun", this.handleLayoutChange, true);
    document.removeEventListener("transitionend", this.handleLayoutChange, true);
    document.removeEventListener("pointerup", this.handleLayoutChange, true);
    document.removeEventListener("pointercancel", this.handleLayoutChange, true);
    window.removeEventListener("resize", this.handleLayoutChange);
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    this.layoutObserver?.disconnect();
    this.layoutObserver = null;
    this.target = null;
    this.layoutTarget = null;

    if (this.animationFrameId !== null) {
      window.cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }

    this.updatePosition(HIDDEN_RAIL_POSITION);
  }

  private readonly handleLayoutChange = (): void => {
    this.scheduleUpdate();
  };

  private scheduleUpdate(): void {
    if (!this.started || this.animationFrameId !== null) {
      return;
    }

    this.animationFrameId = window.requestAnimationFrame(() => {
      this.animationFrameId = null;
      this.evaluate();
    });
  }

  private evaluate(): void {
    const viewportWidth = document.documentElement.clientWidth || window.innerWidth;

    if (!this.target?.isConnected) {
      // Always-visible policy: with no chat target (hero, unloaded session, or
      // a container replacement in progress) keep the rail pinned to the
      // viewport edge instead of disappearing.
      this.updatePosition(initialRailPosition(viewportWidth));
      return;
    }

    const targetRect = this.target.getBoundingClientRect();
    const maximumRight = viewportWidth - VIEWPORT_SAFE_AREA;

    for (const configuration of getPreferredModes()) {
      const left = Math.round(targetRect.right + configuration.gap);
      const available = maximumRight - left;

      if (available < configuration.minWidth) {
        continue;
      }

      this.updatePosition({
        left,
        mode: configuration.mode,
        width: Math.min(configuration.maxWidth, Math.round(available)),
      });
      return;
    }

    // The gutter beside the column is too narrow. Pin the rail to the
    // viewport's right edge instead of collapsing it, still clear of the
    // transcript width handle when the viewport leaves room for that.
    const handleSafeLeft = Math.round(targetRect.right + WIDTH_HANDLE_CLEARANCE);
    for (const configuration of [COMPACT_MODE, FULL_MODE]) {
      const edgeLeft = Math.round(viewportWidth - configuration.maxWidth - EDGE_INSET);
      const left = Math.max(edgeLeft, handleSafeLeft);
      const available = viewportWidth - EDGE_INSET - left;
      const width = Math.min(configuration.maxWidth, available);

      if (width >= configuration.minWidth) {
        this.updatePosition({
          left,
          mode: configuration.mode,
          width,
        });
        return;
      }
    }

    // Last resort on a very narrow window: keep titled entries at the minimum
    // width rather than dropping to a marker strip.
    this.updatePosition(initialRailPosition(viewportWidth));
  }

  private updatePosition(position: RailPosition): void {
    if (positionsEqual(this.currentPosition, position)) {
      return;
    }

    this.currentPosition = position;
    this.options.onPositionChange(position);
  }
}
