// Compile-time flag injected by esbuild `define` (scripts/build-electron.mjs +
// scripts/dev.mjs). True in dev and in an explicit `ANDROMEDA_BENCH=1` build;
// false in shipped builds, so the benchmark-navigation instrumentation in
// main.ts/preload.ts is dead-code-eliminated from the distributed app.
declare const __ANDROMEDA_BENCH__: boolean;
