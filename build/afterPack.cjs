const { execFileSync } = require("node:child_process");
const path = require("node:path");

/**
 * electron-builder afterPack hook for macOS. Two signatures, in this exact
 * order, because each constrains the other:
 *
 * 1. VMP signing (castlabs EVS) — Widevine's "verified media path" check that
 *    DRM license servers (Netflix, Spotify, etc.) require. Needs the EVS
 *    credentials from `evs-account` and network access at build time.
 *    sign-pkg takes the *directory containing* the .app plus a name hint.
 *
 * 2. A fresh ad-hoc Apple code signature, applied LAST. electron-builder runs
 *    with identity:null (no Apple Developer cert), so it does no signing of its
 *    own and leaves the castlabs Electron binary's stale linker signature in
 *    place. Once the app is renamed and the asar/icon are injected that seal is
 *    broken, and a *quarantined download* then reads as "Andromeda is damaged".
 *    Re-sealing with a valid ad-hoc signature downgrades that to the normal
 *    "unidentified developer" prompt (right-click → Open). Doing it after VMP
 *    leaves the VMP signature intact (verified), so Widevine keeps working.
 */
exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== "darwin") {
    return;
  }

  const productName = context.packager.appInfo.productFilename;
  const appPath = path.join(context.appOutDir, `${productName}.app`);

  console.log(`[evs] VMP signing ${productName}.app in ${context.appOutDir}`);
  execFileSync(
    "python3",
    ["-m", "castlabs_evs.vmp", "sign-pkg", "-H", productName, context.appOutDir],
    { stdio: "inherit" }
  );

  console.log(`[sign] ad-hoc codesign ${appPath}`);
  execFileSync("codesign", ["--force", "--deep", "--sign", "-", appPath], {
    stdio: "inherit"
  });
};
