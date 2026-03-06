// metro.config.js — monorepo root shim
// Delegates to the real frontend project so `npx expo start --web` works
// from the repository root as well as from frontend/.
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

// The actual Expo project lives in /frontend
const projectRoot = path.resolve(__dirname, 'frontend');
const monorepoRoot = __dirname;

const config = getDefaultConfig(projectRoot);

// Watch both the monorepo root and the frontend project
config.watchFolders = [monorepoRoot];

// Resolve packages from both node_modules locations (hoisted + local)
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(monorepoRoot, 'node_modules'),
];

// expo/AppEntry.js in the hoisted root node_modules uses a relative
// `../../App` import that resolves to monorepoRoot/App (doesn't exist).
// Redirect it to expo-router/entry (the correct entry for this project).
const expoRouterEntry = path.resolve(
  monorepoRoot, 'node_modules', 'expo-router', 'entry.js',
);
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (
    moduleName === '../../App' &&
    context.originModulePath.replace(/\\/g, '/').endsWith('/expo/AppEntry.js')
  ) {
    return { filePath: expoRouterEntry, type: 'sourceFile' };
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
