const { existsSync } = require('fs');
const { join, resolve } = require('path');
const { execSync } = require('child_process');

const frontendRoot = resolve(__dirname, '..');
const repoRoot = resolve(frontendRoot, '..');

const localModulePath = join(frontendRoot, 'node_modules', 'react-native-gesture-handler');
const hoistedModulePath = join(repoRoot, 'node_modules', 'react-native-gesture-handler');

function run(command, cwd) {
  execSync(command, {
    cwd,
    stdio: 'inherit',
  });
}

if (existsSync(localModulePath)) {
  run('npx patch-package --error-on-fail', frontendRoot);
} else if (existsSync(hoistedModulePath)) {
  run('npx patch-package --error-on-fail --patch-dir frontend/patches', repoRoot);
} else {
  console.log('[postinstall] Skipping patch-package because react-native-gesture-handler is not installed yet.');
}
