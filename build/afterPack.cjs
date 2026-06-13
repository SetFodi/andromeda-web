const { execFileSync } = require("node:child_process");

/**
 * electron-builder afterPack hook: VMP-sign the packaged .app so the castlabs
 * Widevine build can pass the "verified media path" check that DRM license
 * servers (Netflix, Spotify, etc.) require.
 *
 * The app ships unsigned by Apple (identity: null), so electron-builder does no
 * code-signing step that would invalidate the VMP signature — signing here in
 * afterPack is therefore the last mutation of the bundle. VMP signing calls the
 * castlabs EVS service, so it needs the EVS credentials from `evs-account` and
 * network access at build time.
 *
 * castlabs' sign-pkg takes the *directory that contains* the .app plus a name
 * hint, not the .app path itself.
 */
exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== "darwin") {
    return;
  }

  const productName = context.packager.appInfo.productFilename;

  console.log(`[evs] VMP signing ${productName}.app in ${context.appOutDir}`);
  execFileSync(
    "python3",
    ["-m", "castlabs_evs.vmp", "sign-pkg", "-H", productName, context.appOutDir],
    { stdio: "inherit" }
  );
};
