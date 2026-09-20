import { startSectionNav } from "./sectionNav";
import type { PluginContext } from "./pluginTypes";

/** Services that must be available before the rail mounts. */
export const inject = ["locale", "sessions"];

/**
 * Mount the section navigation rail and register its lifecycle.
 * @param ctx - Cordis client context.
 */
export function apply(ctx: PluginContext): void {
  ctx.effect(() => startSectionNav(ctx), "dsh-section-nav: section rail");
}
