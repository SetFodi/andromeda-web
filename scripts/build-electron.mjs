import { build } from "esbuild";

const commonOptions = {
  bundle: true,
  platform: "node",
  target: "node22",
  format: "cjs",
  sourcemap: true,
  external: ["electron"]
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
  })
]);
