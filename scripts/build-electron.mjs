import { build } from "esbuild";

const commonOptions = {
  bundle: true,
  platform: "node",
  target: "node22",
  format: "cjs",
  // Minify the production main/preload bundles: smaller asar, faster startup
  // parse for main.cjs, and a lighter pagePreload that's injected into every
  // web view. Dev (scripts/dev.mjs) stays unminified for readable stack traces.
  minify: true,
  sourcemap: true,
  external: ["electron", "@ghostery/adblocker-electron"],
  // Strip benchmark-navigation instrumentation from shipped builds; only an
  // explicit ANDROMEDA_BENCH=1 build (used by scripts/browser-perf-compare.mjs)
  // keeps it. See src/env.d.ts.
  define: { __ANDROMEDA_BENCH__: process.env.ANDROMEDA_BENCH === "1" ? "true" : "false" }
};

await Promise.all([
  build({
    ...commonOptions,
    entryPoints: ["src/main/main.ts"],
    outfile: "dist/main/main.cjs"
  }),
  build({
    ...commonOptions,
    entryPoints: ["src/preload/preload.ts"],
    outfile: "dist/preload/preload.cjs"
  }),
  build({
    ...commonOptions,
    entryPoints: ["src/preload/pagePreload.ts"],
    outfile: "dist/preload/pagePreload.cjs"
  })
]);
