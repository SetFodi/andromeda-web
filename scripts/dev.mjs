import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import electron from "electron";
import { build } from "esbuild";
import { createServer } from "vite";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function buildElectronSources() {
  const commonOptions = {
    bundle: true,
    platform: "node",
    target: "node22",
    format: "cjs",
    sourcemap: true,
    external: ["electron", "@ghostery/adblocker-electron"],
    // Benchmark instrumentation is always available in dev.
    define: { __ANDROMEDA_BENCH__: "true" }
  };

  await Promise.all([
    build({
      ...commonOptions,
      entryPoints: [path.join(root, "src/main/main.ts")],
      outfile: path.join(root, "dist/main/main.cjs")
    }),
    build({
      ...commonOptions,
      entryPoints: [path.join(root, "src/preload/preload.ts")],
      outfile: path.join(root, "dist/preload/preload.cjs")
    }),
    build({
      ...commonOptions,
      entryPoints: [path.join(root, "src/preload/pagePreload.ts")],
      outfile: path.join(root, "dist/preload/pagePreload.cjs")
    })
  ]);
}

await buildElectronSources();

const server = await createServer({
  configFile: path.join(root, "vite.config.ts"),
  root
});

await server.listen();
const rendererUrl = server.resolvedUrls?.local[0] ?? "http://127.0.0.1:5173/";

const child = spawn(electron, [path.join(root, "dist/main/main.cjs")], {
  cwd: root,
  stdio: "inherit",
  env: {
    ...process.env,
    ELECTRON_RENDERER_URL: rendererUrl,
    NODE_ENV: "development"
  }
});

async function shutdown(exitCode = 0) {
  child.kill();
  await server.close();
  process.exit(exitCode);
}

child.on("exit", async (code) => {
  await server.close();
  process.exit(code ?? 0);
});

process.on("SIGINT", () => {
  void shutdown(0);
});

process.on("SIGTERM", () => {
  void shutdown(0);
});
