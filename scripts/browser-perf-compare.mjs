#!/usr/bin/env node
import { execFile, spawn } from "node:child_process";
import { appendFile, mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const DEFAULT_URLS = [
  "https://example.com",
  "https://github.com",
  "https://react.dev"
];

const TARGETS = {
  helium: {
    id: "helium",
    label: "Helium",
    kind: "app",
    bundleId: "net.imput.helium",
    appName: "Helium",
    fallbackAppPath: "/Applications/Helium.app"
  },
  zen: {
    id: "zen",
    label: "Zen",
    kind: "app",
    bundleId: "app.zen-browser.zen",
    appName: "Zen",
    fallbackAppPath: "/Applications/Zen.app"
  },
  andromeda: {
    id: "andromeda",
    label: "Andromeda",
    kind: "command",
    appName: "Electron",
    command: "pnpm",
    args: ["start"],
    cwd: root,
    navigationMode: "env",
    processRootPatterns: ["Electron.app/Contents/MacOS/Electron", "dist/main/main.cjs"]
  }
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function parseArgs(argv) {
  const options = {
    browsers: ["helium", "zen", "andromeda"],
    urls: DEFAULT_URLS,
    runs: 1,
    intervalMs: 2000,
    launchWaitMs: 8000,
    loadWaitMs: 12000,
    idleMs: 60000,
    outDir: path.join(root, "perf-runs", timestamp()),
    quitExisting: false,
    quitAfter: false,
    buildAndromeda: false,
    powermetrics: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];

    if (arg === "--") {
      continue;
    } else if (arg === "--help" || arg === "-h") {
      options.help = true;
    } else if (arg === "--browsers" && next) {
      options.browsers = next.split(",").map((item) => item.trim()).filter(Boolean);
      index += 1;
    } else if (arg === "--urls" && next) {
      options.urls = next.split(",").map((item) => item.trim()).filter(Boolean);
      index += 1;
    } else if (arg === "--runs" && next) {
      options.runs = positiveInt(next, options.runs);
      index += 1;
    } else if (arg === "--interval" && next) {
      options.intervalMs = positiveFloat(next, options.intervalMs / 1000) * 1000;
      index += 1;
    } else if (arg === "--launch-wait" && next) {
      options.launchWaitMs = positiveFloat(next, options.launchWaitMs / 1000) * 1000;
      index += 1;
    } else if (arg === "--load-wait" && next) {
      options.loadWaitMs = positiveFloat(next, options.loadWaitMs / 1000) * 1000;
      index += 1;
    } else if ((arg === "--idle" || arg === "--duration") && next) {
      options.idleMs = positiveFloat(next, options.idleMs / 1000) * 1000;
      index += 1;
    } else if (arg === "--out" && next) {
      options.outDir = path.resolve(next);
      index += 1;
    } else if (arg === "--quit-existing") {
      options.quitExisting = true;
    } else if (arg === "--quit-after") {
      options.quitAfter = true;
    } else if (arg === "--build-andromeda") {
      options.buildAndromeda = true;
    } else if (arg === "--powermetrics") {
      options.powermetrics = true;
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }

  return options;
}

function positiveInt(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function positiveFloat(value, fallback) {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function printHelp() {
  console.log(`
Browser performance comparison for Helium, Zen, and Andromeda.

Measures:
  - Browser process tree CPU %
  - Browser process tree RAM RSS
  - Process count
  - Approx CPU-seconds
  - Coarse battery percentage/capacity before and after
  - Optional raw powermetrics capture if you pass --powermetrics

Default workflow:
  1. Launch each browser
  2. Navigate the active address bar through each URL
  3. Idle on the final URL and sample CPU/RAM/battery
  4. Write samples.csv, summary.csv, summary.json

Usage:
  node scripts/browser-perf-compare.mjs
  node scripts/browser-perf-compare.mjs --quit-existing --quit-after
  node scripts/browser-perf-compare.mjs --duration 120 --interval 2
  node scripts/browser-perf-compare.mjs --urls https://github.com,https://react.dev,https://news.ycombinator.com
  node scripts/browser-perf-compare.mjs --browsers zen,andromeda

Options:
  --browsers a,b       helium,zen,andromeda (default: all)
  --urls a,b           Comma-separated URLs (default: example.com, github.com, react.dev)
  --runs n             Runs per browser (default: 1)
  --interval seconds   Sample interval (default: 2)
  --launch-wait sec    Wait after launch before navigation (default: 8)
  --load-wait sec      Wait after each URL navigation (default: 12)
  --duration sec       Idle sampling time after final URL (default: 60)
  --out dir            Output directory (default: perf-runs/<timestamp>)
  --quit-existing      Quit target browser before each run for cleaner numbers
  --quit-after         Quit target browser after each run
  --build-andromeda    Run pnpm build before benchmarking Andromeda
  --powermetrics       Capture raw powermetrics output, requires sudo

Notes:
  - macOS Accessibility permission is required because URLs are entered with Cmd+L.
  - Battery deltas are coarse. Run on battery, with charger unplugged, for meaningful drain data.
  - For fair Andromeda numbers, use production mode: pnpm build, then this script.
`);
}

async function main() {
  if (process.platform !== "darwin") {
    throw new Error("This script is macOS-focused because it uses open, pmset, ioreg, and AppleScript.");
  }

  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }

  const selectedTargets = options.browsers.map((id) => {
    const target = TARGETS[id];
    if (!target) {
      throw new Error(`Unknown browser "${id}". Use one of: ${Object.keys(TARGETS).join(", ")}`);
    }
    return target;
  });

  await mkdir(options.outDir, { recursive: true });
  const samplesCsvPath = path.join(options.outDir, "samples.csv");
  const summaryCsvPath = path.join(options.outDir, "summary.csv");
  const summaryJsonPath = path.join(options.outDir, "summary.json");
  const configPath = path.join(options.outDir, "config.json");

  await writeFile(
    samplesCsvPath,
    [
      "browser",
      "run",
      "phase",
      "elapsedSec",
      "processCount",
      "cpuPercent",
      "rssMB",
      "batteryPercent",
      "batterySource",
      "pids"
    ].join(",") + "\n"
  );
  await writeFile(
    summaryCsvPath,
    [
      "browser",
      "run",
      "samples",
      "wallSeconds",
      "avgCpuPercent",
      "peakCpuPercent",
      "cpuSecondsApprox",
      "avgRssMB",
      "peakRssMB",
      "avgProcessCount",
      "peakProcessCount",
      "batteryPercentDelta",
      "batteryCapacityDelta",
      "wasRunningBefore"
    ].join(",") + "\n"
  );
  await writeFile(configPath, JSON.stringify({ ...options, host: os.hostname() }, null, 2));

  if (options.buildAndromeda && options.browsers.includes("andromeda")) {
    console.log("Building Andromeda before benchmark...");
    await execChecked("pnpm", ["build"], { cwd: root, stdio: "inherit" });
  }

  const resolvedTargets = [];
  for (const target of selectedTargets) {
    resolvedTargets.push(await resolveTarget(target));
  }

  const summaries = [];
  for (const target of resolvedTargets) {
    for (let run = 1; run <= options.runs; run += 1) {
      console.log(`\n=== ${target.label} run ${run}/${options.runs} ===`);
      const summary = await runBenchmark(target, run, options, samplesCsvPath);
      summaries.push(summary);
      await appendFile(summaryCsvPath, summaryToCsv(summary) + "\n");
      await writeFile(summaryJsonPath, JSON.stringify(summaries, null, 2));
      console.log(formatSummary(summary));
      await sleep(2500);
    }
  }

  console.log(`\nDone. Results written to:\n  ${options.outDir}`);
}

async function resolveTarget(target) {
  if (target.kind !== "app") {
    return target;
  }

  const appPath = await findBundlePath(target.bundleId);
  return {
    ...target,
    appPath: appPath ?? target.fallbackAppPath
  };
}

async function findBundlePath(bundleId) {
  try {
    const { stdout } = await execCapture("mdfind", [`kMDItemCFBundleIdentifier == "${bundleId}"`]);
    return stdout
      .split("\n")
      .map((line) => line.trim())
      .find((line) => line.endsWith(".app")) ?? null;
  } catch {
    return null;
  }
}

async function runBenchmark(target, run, options, samplesCsvPath) {
  let spawned = null;
  let phase = "setup";
  target.runtimeRootPids = [];
  const startedAt = Date.now();
  const records = [];
  const batteryStart = await readBattery();
  const beforeRows = await matchingRows(target);
  const wasRunningBefore = beforeRows.length > 0;

  if (wasRunningBefore && options.quitExisting) {
    console.log(`Quitting existing ${target.label} processes...`);
    await quitTarget(target);
    await waitForNoProcesses(target, 15000);
  } else if (wasRunningBefore) {
    console.log(`Warning: ${target.label} is already running; results may include existing tabs/processes.`);
  }

  const sampler = sampleLoop({
    target,
    run,
    samplesCsvPath,
    records,
    getPhase: () => phase,
    startedAt,
    intervalMs: options.intervalMs
  });

  try {
    phase = "launch";
    sampler.start();
    spawned = await launchTarget(target, wasRunningBefore && !options.quitExisting, options);
    await sleep(options.launchWaitMs);
    target.runtimeRootPids = await findRuntimeRootPids(target);

    phase = "navigate";
    if (target.navigationMode === "env") {
      for (const url of options.urls) {
        console.log(`Opening ${url}`);
      }
      await sleep(options.urls.length * options.loadWaitMs + 1000);
    } else {
      for (const url of options.urls) {
        console.log(`Opening ${url}`);
        await navigateAddressBar(target.appName, url);
        await sleep(options.loadWaitMs);
      }
    }

    phase = "idle";
    console.log(`Sampling idle for ${Math.round(options.idleMs / 1000)}s...`);

    let power = null;
    if (options.powermetrics) {
      power = capturePowermetrics(target, run, options);
    }

    await sleep(options.idleMs);
    if (power) {
      await power.stop();
    }
  } finally {
    phase = "cleanup";
    await sampler.stop();

    if (options.quitAfter) {
      spawned?.markExpectedTermination?.();
      await quitTarget(target);
      await waitForNoProcesses(target, 15000);
    } else if (spawned?.kill) {
      spawned.kill("SIGTERM");
    }
  }

  const batteryEnd = await readBattery();
  return buildSummary({
    target,
    run,
    startedAt,
    records,
    batteryStart,
    batteryEnd,
    wasRunningBefore
  });
}

async function launchTarget(target, useExisting, options) {
  if (useExisting) {
    await activateApp(target.appName);
    return null;
  }

  if (target.kind === "app") {
    await execChecked("open", ["-b", target.bundleId]);
    await activateApp(target.appName);
    return null;
  }

  const child = spawn(target.command, target.args, {
    cwd: target.cwd,
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...process.env,
      NODE_ENV: "production",
      ...(target.navigationMode === "env"
        ? {
            ANDROMEDA_BENCHMARK_URLS: JSON.stringify(options.urls),
            ANDROMEDA_BENCHMARK_NAVIGATE_DELAY_MS: String(options.launchWaitMs),
            ANDROMEDA_BENCHMARK_LOAD_WAIT_MS: String(options.loadWaitMs)
          }
        : {})
    }
  });

  let expectedTermination = false;
  child.markExpectedTermination = () => {
    expectedTermination = true;
  };
  const shouldSuppressExpectedTermination = (chunk) => {
    if (!expectedTermination) {
      return false;
    }

    const text = String(chunk);
    return (
      text.includes("SIGTERM") ||
      text.includes("ELIFECYCLE") ||
      text.includes("Network service crashed or was terminated") ||
      text.includes("GPU process exited unexpectedly: exit_code=15")
    );
  };
  child.stdout.on("data", (chunk) => {
    if (!shouldSuppressExpectedTermination(chunk)) {
      process.stdout.write(`[${target.id}] ${chunk}`);
    }
  });
  child.stderr.on("data", (chunk) => {
    if (!shouldSuppressExpectedTermination(chunk)) {
      process.stderr.write(`[${target.id}] ${chunk}`);
    }
  });
  await sleep(1000);
  return child;
}

async function activateApp(appName) {
  await execChecked("osascript", ["-e", `tell application "${escapeAppleScript(appName)}" to activate`]);
}

async function navigateAddressBar(appName, url) {
  const script = `
on run argv
  set targetApp to item 1 of argv
  set targetUrl to item 2 of argv
  tell application targetApp to activate
  delay 0.18
  tell application "System Events"
    keystroke "l" using {command down}
    delay 0.16
    keystroke targetUrl
    delay 0.08
    key code 36
  end tell
end run
`;

  try {
    await execChecked("osascript", ["-e", script, appName, url]);
  } catch (error) {
    throw new Error(
      `Could not automate ${appName}'s address bar. Give your terminal/Codex Accessibility permission in macOS Settings, then retry.\n${error.message}`
    );
  }
}

async function quitTarget(target) {
  if (target.kind === "app") {
    await execChecked("osascript", ["-e", `tell application id "${target.bundleId}" to quit`], {
      allowFailure: true
    });
    return;
  }

  const rows = await matchingRows(target);
  for (const row of rows.sort((a, b) => b.pid - a.pid)) {
    try {
      process.kill(row.pid, "SIGTERM");
    } catch {
      // process already exited
    }
  }
}

async function waitForNoProcesses(target, timeoutMs) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const rows = await matchingRows(target);
    if (rows.length === 0) {
      return;
    }
    await sleep(500);
  }
}

function sampleLoop({ target, run, samplesCsvPath, records, getPhase, startedAt, intervalMs }) {
  let stopped = false;
  let running = false;
  let promise = null;

  async function tick() {
    while (!stopped) {
      running = true;
      const rows = await matchingRows(target);
      const battery = await readBattery();
      const stats = summarizeProcessRows(rows);
      const record = {
        browser: target.id,
        run,
        phase: getPhase(),
        elapsedSec: (Date.now() - startedAt) / 1000,
        processCount: stats.processCount,
        cpuPercent: stats.cpuPercent,
        rssMB: stats.rssMB,
        batteryPercent: battery.percent,
        batterySource: battery.source,
        pids: stats.pids
      };
      records.push(record);
      await appendFile(samplesCsvPath, sampleToCsv(record) + "\n");
      await sleep(intervalMs);
    }
    running = false;
  }

  return {
    start() {
      promise = tick();
    },
    async stop() {
      stopped = true;
      if (running && promise) {
        await promise;
      }
    }
  };
}

async function matchingRows(target) {
  const rows = await readProcessTable();
  if (target.kind === "app") {
    const appPath = target.appPath ?? target.fallbackAppPath;
    const directRows = rows.filter((row) => row.command.includes(`${appPath}/Contents/`));
    const rootPids = directRows
      .filter((row) => row.command.includes(`${appPath}/Contents/MacOS/`))
      .map((row) => row.pid);
    const descendantPids = collectDescendantPids(rows, rootPids);
    return uniqueRows([...directRows, ...rows.filter((row) => descendantPids.has(row.pid))]);
  }

  const rootPids = target.runtimeRootPids?.length
    ? target.runtimeRootPids
    : await findRuntimeRootPids(target);
  const descendantPids = collectDescendantPids(rows, rootPids);
  return rows.filter((row) => descendantPids.has(row.pid));
}

async function findRuntimeRootPids(target) {
  const rows = await readProcessTable();
  if (target.kind === "app") {
    const appPath = target.appPath ?? target.fallbackAppPath;
    return rows
      .filter((row) => row.command.includes(`${appPath}/Contents/MacOS/`))
      .map((row) => row.pid);
  }

  const patterns = target.processRootPatterns ?? [];
  return rows
    .filter((row) => {
      if (row.command.includes("scripts/browser-perf-compare.mjs")) {
        return false;
      }
      return patterns.every((pattern) => row.command.includes(pattern));
    })
    .map((row) => row.pid);
}

function collectDescendantPids(rows, rootPids) {
  const pids = new Set(rootPids);
  let changed = true;

  while (changed) {
    changed = false;
    for (const row of rows) {
      if (!pids.has(row.pid) && pids.has(row.ppid)) {
        pids.add(row.pid);
        changed = true;
      }
    }
  }

  return pids;
}

function uniqueRows(rows) {
  const seen = new Set();
  return rows.filter((row) => {
    if (seen.has(row.pid)) {
      return false;
    }
    seen.add(row.pid);
    return true;
  });
}

async function readProcessTable() {
  const { stdout } = await execCapture("ps", ["-axo", "pid=,ppid=,rss=,pcpu=,command="]);
  return stdout
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const match = line.match(/^(\d+)\s+(\d+)\s+(\d+)\s+([0-9.]+)\s+(.*)$/);
      if (!match) {
        return null;
      }
      return {
        pid: Number(match[1]),
        ppid: Number(match[2]),
        rssKB: Number(match[3]),
        cpuPercent: Number(match[4]),
        command: match[5]
      };
    })
    .filter(Boolean);
}

function summarizeProcessRows(rows) {
  return {
    processCount: rows.length,
    cpuPercent: sum(rows.map((row) => row.cpuPercent)),
    rssMB: sum(rows.map((row) => row.rssKB)) / 1024,
    pids: rows.map((row) => row.pid).sort((a, b) => a - b)
  };
}

async function readBattery() {
  const battery = {
    percent: null,
    source: "unknown",
    currentCapacity: null,
    maxCapacity: null,
    rawPmset: "",
    rawIoreg: ""
  };

  try {
    const { stdout } = await execCapture("pmset", ["-g", "batt"]);
    battery.rawPmset = stdout.trim();
    const percent = stdout.match(/(\d+)%/);
    if (percent) {
      battery.percent = Number(percent[1]);
    }
    if (stdout.includes("Battery Power")) {
      battery.source = "battery";
    } else if (stdout.includes("AC Power")) {
      battery.source = "ac";
    }
  } catch {
    // ignore
  }

  try {
    const { stdout } = await execCapture("ioreg", ["-rn", "AppleSmartBattery"]);
    battery.rawIoreg = stdout.trim();
    const current = stdout.match(/"CurrentCapacity"\s+=\s+(\d+)/);
    const max = stdout.match(/"MaxCapacity"\s+=\s+(\d+)/);
    if (current) {
      battery.currentCapacity = Number(current[1]);
    }
    if (max) {
      battery.maxCapacity = Number(max[1]);
    }
  } catch {
    // ignore
  }

  return battery;
}

function capturePowermetrics(target, run, options) {
  const outputPath = path.join(options.outDir, `powermetrics-${target.id}-run-${run}.txt`);
  const child = spawn(
    "sudo",
    [
      "powermetrics",
      "--samplers",
      "tasks",
      "--show-process-energy",
      "-i",
      String(Math.max(1000, Math.round(options.intervalMs))),
      "-n",
      String(Math.max(1, Math.ceil(options.idleMs / options.intervalMs)))
    ],
    { stdio: ["inherit", "pipe", "pipe"] }
  );

  const chunks = [];
  child.stdout.on("data", (chunk) => chunks.push(chunk));
  child.stderr.on("data", (chunk) => chunks.push(chunk));

  return {
    async stop() {
      await new Promise((resolve) => {
        child.once("exit", resolve);
        child.kill("SIGINT");
        setTimeout(resolve, 2000);
      });
      await writeFile(outputPath, Buffer.concat(chunks));
    }
  };
}

function buildSummary({ target, run, startedAt, records, batteryStart, batteryEnd, wasRunningBefore }) {
  const sampleCount = records.length;
  const wallSeconds = (Date.now() - startedAt) / 1000;
  const cpuValues = records.map((record) => record.cpuPercent);
  const rssValues = records.map((record) => record.rssMB);
  const processCounts = records.map((record) => record.processCount);
  const intervalSeconds = sampleCount > 1
    ? (records[records.length - 1].elapsedSec - records[0].elapsedSec) / (sampleCount - 1)
    : 0;

  return {
    browser: target.id,
    label: target.label,
    run,
    sampleCount,
    wallSeconds,
    avgCpuPercent: average(cpuValues),
    peakCpuPercent: Math.max(0, ...cpuValues),
    cpuSecondsApprox: sum(cpuValues.map((value) => (value / 100) * intervalSeconds)),
    avgRssMB: average(rssValues),
    peakRssMB: Math.max(0, ...rssValues),
    avgProcessCount: average(processCounts),
    peakProcessCount: Math.max(0, ...processCounts),
    batteryStart,
    batteryEnd,
    batteryPercentDelta:
      batteryStart.percent !== null && batteryEnd.percent !== null
        ? batteryEnd.percent - batteryStart.percent
        : null,
    batteryCapacityDelta:
      batteryStart.currentCapacity !== null && batteryEnd.currentCapacity !== null
        ? batteryEnd.currentCapacity - batteryStart.currentCapacity
        : null,
    wasRunningBefore
  };
}

function sampleToCsv(record) {
  return [
    record.browser,
    record.run,
    record.phase,
    fixed(record.elapsedSec),
    record.processCount,
    fixed(record.cpuPercent),
    fixed(record.rssMB),
    record.batteryPercent ?? "",
    record.batterySource,
    `"${record.pids.join(" ")}"`
  ].join(",");
}

function summaryToCsv(summary) {
  return [
    summary.browser,
    summary.run,
    summary.sampleCount,
    fixed(summary.wallSeconds),
    fixed(summary.avgCpuPercent),
    fixed(summary.peakCpuPercent),
    fixed(summary.cpuSecondsApprox),
    fixed(summary.avgRssMB),
    fixed(summary.peakRssMB),
    fixed(summary.avgProcessCount),
    summary.peakProcessCount,
    summary.batteryPercentDelta ?? "",
    summary.batteryCapacityDelta ?? "",
    summary.wasRunningBefore
  ].join(",");
}

function formatSummary(summary) {
  return [
    `${summary.label} run ${summary.run}:`,
    `  avg CPU: ${fixed(summary.avgCpuPercent)}%`,
    `  peak CPU: ${fixed(summary.peakCpuPercent)}%`,
    `  approx CPU-seconds: ${fixed(summary.cpuSecondsApprox)}`,
    `  avg RAM: ${fixed(summary.avgRssMB)} MB`,
    `  peak RAM: ${fixed(summary.peakRssMB)} MB`,
    `  avg processes: ${fixed(summary.avgProcessCount)}`,
    `  battery delta: ${summary.batteryPercentDelta ?? "n/a"}% / ${summary.batteryCapacityDelta ?? "n/a"} capacity units`
  ].join("\n");
}

function fixed(value) {
  return Number.isFinite(value) ? value.toFixed(2) : "";
}

function sum(values) {
  return values.reduce((total, value) => total + (Number.isFinite(value) ? value : 0), 0);
}

function average(values) {
  const valid = values.filter((value) => Number.isFinite(value));
  return valid.length ? sum(valid) / valid.length : 0;
}

function escapeAppleScript(value) {
  return String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

async function execChecked(command, args, options = {}) {
  const result = await execCapture(command, args, options);
  if (result.code !== 0 && !options.allowFailure) {
    throw new Error(`${command} ${args.join(" ")} failed:\n${result.stderr || result.stdout}`);
  }
  return result;
}

function execCapture(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = execFile(command, args, {
      cwd: options.cwd,
      maxBuffer: 1024 * 1024 * 20
    });

    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (chunk) => {
      stdout += chunk;
      if (options.stdio === "inherit") {
        process.stdout.write(chunk);
      }
    });
    child.stderr?.on("data", (chunk) => {
      stderr += chunk;
      if (options.stdio === "inherit") {
        process.stderr.write(chunk);
      }
    });
    child.on("error", reject);
    child.on("exit", (code) => resolve({ code: code ?? 0, stdout, stderr }));
  });
}

main().catch((error) => {
  console.error(`\nBenchmark failed:\n${error.message}`);
  process.exit(1);
});
