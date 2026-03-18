const { withMainActivity, withAndroidManifest, createRunOncePlugin } = require('@expo/config-plugins');

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
  const withDelegate = withMainActivity(config, (mod) => {
    if (mod.modResults.language !== 'kt') {
      return mod;
    }

    let contents = mod.modResults.contents;
    contents = addImportIfMissing(contents);
    contents = addDelegateInitializationIfMissing(contents);
    mod.modResults.contents = contents;

    return mod;
  });

  return withAndroidManifest(withDelegate, (mod) => {
    const manifest = mod.modResults.manifest;
    const application = manifest?.application?.[0];
    if (!application) {
      return mod;
    }

    const activities = application.activity ?? [];
    for (const activity of activities) {
      if (activity?.$?.['android:name'] !== '.MainActivity') continue;

      const intentFilters = activity['intent-filter'] ?? [];
      const seenRationale = [];
      const dedupedFilters = [];

      for (const filter of intentFilters) {
        const actions = filter?.action ?? [];
        const hasRationaleAction = actions.some(
          (action) => action?.$?.['android:name'] === 'androidx.health.ACTION_SHOW_PERMISSIONS_RATIONALE',
        );

        if (!hasRationaleAction) {
          dedupedFilters.push(filter);
          continue;
        }

        if (seenRationale.length === 0) {
          dedupedFilters.push(filter);
          seenRationale.push(true);
        }
      }

      if (seenRationale.length === 0) {
        dedupedFilters.push({
          action: [{ $: { 'android:name': 'androidx.health.ACTION_SHOW_PERMISSIONS_RATIONALE' } }],
        });
      }

      activity['intent-filter'] = dedupedFilters;
    }

    const activityAliases = application['activity-alias'] ?? [];
    const hasPermissionUsageAlias = activityAliases.some(
      (alias) => alias?.$?.['android:name'] === 'ViewPermissionUsageActivity',
    );

    if (!hasPermissionUsageAlias) {
      activityAliases.push({
        $: {
          'android:name': 'ViewPermissionUsageActivity',
          'android:exported': 'true',
          'android:targetActivity': '.MainActivity',
          'android:permission': 'android.permission.START_VIEW_PERMISSION_USAGE',
        },
        'intent-filter': [
          {
            action: [{ $: { 'android:name': 'android.intent.action.VIEW_PERMISSION_USAGE' } }],
            category: [{ $: { 'android:name': 'android.intent.category.HEALTH_PERMISSIONS' } }],
          },
        ],
      });
    }

    application['activity-alias'] = activityAliases;
    return mod;
  });
}

module.exports = createRunOncePlugin(
  withHealthConnectPermissionDelegate,
  PACKAGE_NAME,
  PACKAGE_VERSION,
);
