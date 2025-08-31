const fs = require('fs');
const path = require('path');

/**
 * Ensure @node-red/nodes/examples exists in the packaged app
 * - Uses the TARGET platform from electron-builder context (not process.platform)
 * - Works for both asar:true (app.asar.unpacked/...) and asar:false (app/...)
 */
exports.default = async function (context) {
  const appOutDir = context.appOutDir;
  const productName = context.packager.appInfo.productFilename;
  const target = context.electronPlatformName; // 'darwin' | 'win32' | 'linux'

  // Resolve the app's Resources directory for the TARGET
  const resourcesDir =
    target === 'darwin'
      ? path.join(appOutDir, `${productName}.app`, 'Contents', 'Resources')
      : path.join(appOutDir, 'resources');

  // Prefer asar-unpacked if present; otherwise fall back to app/
  const unpackedBase = path.join(resourcesDir, 'app.asar.unpacked');
  const appBase = fs.existsSync(unpackedBase) ? unpackedBase : path.join(resourcesDir, 'app');

  const examplesDir = path.join(appBase, 'node_modules', '@node-red', 'nodes', 'examples');

  fs.mkdirSync(examplesDir, { recursive: true });
  try {
    const placeholder = path.join(examplesDir, '.placeholder');
    if (!fs.existsSync(placeholder)) fs.writeFileSync(placeholder, '');
    console.log('[afterPack] ensured examples dir for', target, '→', examplesDir);
  } catch (e) {
    console.warn('[afterPack] warning: could not write placeholder:', e && e.message ? e.message : e);
  }
};