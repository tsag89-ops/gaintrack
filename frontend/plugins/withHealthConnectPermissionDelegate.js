const { withMainActivity, createRunOncePlugin } = require('@expo/config-plugins');

const PACKAGE_NAME = 'with-health-connect-permission-delegate';
const PACKAGE_VERSION = '1.0.0';

function addImportIfMissing(src) {
  const importLine = 'import dev.matinzd.healthconnect.permissions.HealthConnectPermissionDelegate';
  if (src.includes(importLine)) return src;

  const packageRegex = /(^package\s+[\w.]+\s*\n)/m;
  if (packageRegex.test(src)) {
    return src.replace(packageRegex, `$1\n${importLine}\n`);
  }

  return `${importLine}\n${src}`;
}

function addDelegateInitializationIfMissing(src) {
  const initLine = 'HealthConnectPermissionDelegate.setPermissionDelegate(this)';
  if (src.includes(initLine)) return src;

  const onCreateCallRegex = /super\.onCreate\((null|savedInstanceState)\)/;
  if (!onCreateCallRegex.test(src)) {
    return src;
  }

  return src.replace(
    onCreateCallRegex,
    (match) => `${match}\n    ${initLine}`,
  );
}

function withHealthConnectPermissionDelegate(config) {
  return withMainActivity(config, (mod) => {
    if (mod.modResults.language !== 'kt') {
      return mod;
    }

    let contents = mod.modResults.contents;
    contents = addImportIfMissing(contents);
    contents = addDelegateInitializationIfMissing(contents);
    mod.modResults.contents = contents;

    return mod;
  });
}

module.exports = createRunOncePlugin(
  withHealthConnectPermissionDelegate,
  PACKAGE_NAME,
  PACKAGE_VERSION,
);
