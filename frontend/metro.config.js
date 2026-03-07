// metro.config.js
const { getDefaultConfig } = require("expo/metro-config");
const path = require('path');
const { FileStore } = require('metro-cache');

const projectRoot = __dirname;
const monorepoRoot = path.resolve(projectRoot, '..');

const config = getDefaultConfig(projectRoot);

// Use a stable on-disk store (shared across web/android)
const cacheRoot = process.env.METRO_CACHE_ROOT || path.join(projectRoot, '.metro-cache');
config.cacheStores = [
  new FileStore({ root: path.join(cacheRoot, 'cache') }),
];

// ── Monorepo support ──────────────────────────────────────────────────────────
// All packages are hoisted to the monorepo root node_modules (no frontend/node_modules).
// Tell Metro to watch the monorepo root and resolve modules from both locations.
config.watchFolders = [...(config.watchFolders ?? []), monorepoRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(monorepoRoot, 'node_modules'),
];

// Fix: expo/AppEntry.js uses `import App from '../../App'`.
// With hoisted packages, this resolves to monorepoRoot/App (does not exist)
// instead of projectRoot/App.tsx.  Since this project uses expo-router
// ("main": "expo-router/entry" in package.json), redirect that import to
// expo-router/entry.js so the web dev server bundles correctly.
const expoRouterEntry = path.resolve(
  monorepoRoot, 'node_modules', 'expo-router', 'entry.js',
);
const prevResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (
    moduleName === '../../App' &&
    context.originModulePath.replace(/\\/g, '/').endsWith('/expo/AppEntry.js')
  ) {
    return { filePath: expoRouterEntry, type: 'sourceFile' };
  }
  if (prevResolveRequest) {
    return prevResolveRequest(context, moduleName, platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};

// Reduce the number of workers to decrease resource usage
config.maxWorkers = 2;

module.exports = config;
