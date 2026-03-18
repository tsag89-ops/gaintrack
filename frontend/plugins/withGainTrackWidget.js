/**
 * Expo config plugin: withGainTrackWidget
 *
 * Injects both GainTrack Android home-screen widgets into the native project
 * during every `expo prebuild` / EAS build.
 *
 * Widgets provided:
 *   • GainTrackStatsWidgetProvider  – compact 3×2 stats card
 *   • GainTrackWideWidgetProvider   – wide 4×2 split-pane card
 *
 * The plugin is idempotent: running prebuild multiple times does not duplicate
 * manifest entries, string resources, or source files.
 */

const {
  withAndroidManifest,
  withDangerousMod,
  withMainApplication,
  withStringsXml,
  createRunOncePlugin,
} = require('@expo/config-plugins');
const path = require('path');
const fs = require('fs');

const PACKAGE_NAME = 'with-gaintrack-widget';
const PACKAGE_VERSION = '1.0.0';

// Paths relative to the Expo project root (frontend/)
const WIDGET_JAVA_DIR =
  'android/app/src/main/java/com/tsag89ops/gaintrack/widget';
const RES_LAYOUT_DIR = 'android/app/src/main/res/layout';
const RES_DRAWABLE_DIR = 'android/app/src/main/res/drawable';
const RES_XML_DIR = 'android/app/src/main/res/xml';

// ---------------------------------------------------------------------------
// Kotlin source files
// ---------------------------------------------------------------------------

const BRIDGE_PACKAGE_KT = `package com.tsag89ops.gaintrack.widget

import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.ViewManager

class GainTrackWidgetBridgePackage : ReactPackage {
  override fun createNativeModules(reactContext: ReactApplicationContext): List<NativeModule> {
    return listOf(GainTrackWidgetBridgeModule(reactContext))
  }

  override fun createViewManagers(
    reactContext: ReactApplicationContext,
  ): List<ViewManager<*, *>> = emptyList()
}
`;

const BRIDGE_MODULE_KT = `package com.tsag89ops.gaintrack.widget

import android.content.Context
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import kotlin.math.roundToInt
import kotlin.math.roundToLong

class GainTrackWidgetBridgeModule(
  reactContext: ReactApplicationContext,
) : ReactContextBaseJavaModule(reactContext) {

  override fun getName(): String = "GainTrackWidgetBridge"

  @ReactMethod
  fun updateStats(weeklyVolume: Double, workoutsCount: Double, lastUpdated: String?) {
    val prefs = reactApplicationContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
    prefs.edit()
      .putLong(KEY_WEEKLY_VOLUME, weeklyVolume.roundToLong())
      .putInt(KEY_WORKOUTS_COUNT, workoutsCount.roundToInt())
      .putString(KEY_LAST_UPDATED, lastUpdated ?: "")
      .apply()

    GainTrackStatsWidgetProvider.notifyWidgets(reactApplicationContext)
    GainTrackWideWidgetProvider.notifyWidgets(reactApplicationContext)
  }

  @ReactMethod
  fun clearStats() {
    val prefs = reactApplicationContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
    prefs.edit().clear().apply()
    GainTrackStatsWidgetProvider.notifyWidgets(reactApplicationContext)
    GainTrackWideWidgetProvider.notifyWidgets(reactApplicationContext)
  }

  companion object {
    const val PREFS_NAME = "gaintrack_widget"
    const val KEY_WEEKLY_VOLUME = "weekly_volume"
    const val KEY_WORKOUTS_COUNT = "workouts_count"
    const val KEY_LAST_UPDATED = "last_updated"
  }
}
`;

const STATS_WIDGET_PROVIDER_KT = `package com.tsag89ops.gaintrack.widget

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.widget.RemoteViews
import com.tsag89ops.gaintrack.R
import java.text.NumberFormat
import java.util.Locale

class GainTrackStatsWidgetProvider : AppWidgetProvider() {

  override fun onUpdate(
    context: Context,
    appWidgetManager: AppWidgetManager,
    appWidgetIds: IntArray,
  ) {
    appWidgetIds.forEach { appWidgetId ->
      updateAppWidget(context, appWidgetManager, appWidgetId)
    }
  }

  companion object {
    fun notifyWidgets(context: Context) {
      val manager = AppWidgetManager.getInstance(context)
      val component = ComponentName(context, GainTrackStatsWidgetProvider::class.java)
      val ids = manager.getAppWidgetIds(component)
      if (ids.isEmpty()) return
      ids.forEach { id -> updateAppWidget(context, manager, id) }
    }

    private fun updateAppWidget(
      context: Context,
      appWidgetManager: AppWidgetManager,
      appWidgetId: Int,
    ) {
      val prefs = context.getSharedPreferences(
        GainTrackWidgetBridgeModule.PREFS_NAME,
        Context.MODE_PRIVATE,
      )
      val weeklyVolume = prefs.getLong(GainTrackWidgetBridgeModule.KEY_WEEKLY_VOLUME, 0L)
      val workoutsCount = prefs.getInt(GainTrackWidgetBridgeModule.KEY_WORKOUTS_COUNT, 0)
      val lastUpdated = prefs.getString(GainTrackWidgetBridgeModule.KEY_LAST_UPDATED, "") ?: ""

      val volumeText = "\${formatVolume(weeklyVolume)} kg"
      val updatedPrefix = context.getString(R.string.gaintrack_widget_last_updated_prefix)
      val updatedText = if (lastUpdated.isNotBlank()) "${'$'}updatedPrefix ${'$'}lastUpdated" else ""

      val views = RemoteViews(context.packageName, R.layout.gaintrack_stats_widget)
      views.setTextViewText(R.id.widget_volume_value, volumeText)
      views.setTextViewText(R.id.widget_workouts_value, workoutsCount.toString())
      views.setTextViewText(R.id.widget_last_updated, updatedText)

      createLaunchPendingIntent(context)?.let { views.setOnClickPendingIntent(R.id.widget_root, it) }
      appWidgetManager.updateAppWidget(appWidgetId, views)
    }

    private fun createLaunchPendingIntent(context: Context): PendingIntent? {
      val intent = context.packageManager
        .getLaunchIntentForPackage(context.packageName)
        ?.apply { flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP }
        ?: return null
      return PendingIntent.getActivity(
        context, 0, intent,
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
      )
    }

    private fun formatVolume(volume: Long): String =
      NumberFormat.getIntegerInstance(Locale.getDefault()).format(volume)
  }
}
`;

const WIDE_WIDGET_PROVIDER_KT = `package com.tsag89ops.gaintrack.widget

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.widget.RemoteViews
import com.tsag89ops.gaintrack.R
import java.text.NumberFormat
import java.util.Locale

class GainTrackWideWidgetProvider : AppWidgetProvider() {

  override fun onUpdate(
    context: Context,
    appWidgetManager: AppWidgetManager,
    appWidgetIds: IntArray,
  ) {
    appWidgetIds.forEach { id -> updateAppWidget(context, appWidgetManager, id) }
  }

  companion object {
    fun notifyWidgets(context: Context) {
      val manager = AppWidgetManager.getInstance(context)
      val component = ComponentName(context, GainTrackWideWidgetProvider::class.java)
      val ids = manager.getAppWidgetIds(component)
      if (ids.isEmpty()) return
      ids.forEach { id -> updateAppWidget(context, manager, id) }
    }

    private fun updateAppWidget(
      context: Context,
      appWidgetManager: AppWidgetManager,
      appWidgetId: Int,
    ) {
      val prefs = context.getSharedPreferences(
        GainTrackWidgetBridgeModule.PREFS_NAME,
        Context.MODE_PRIVATE,
      )
      val weeklyVolume = prefs.getLong(GainTrackWidgetBridgeModule.KEY_WEEKLY_VOLUME, 0L)
      val workoutsCount = prefs.getInt(GainTrackWidgetBridgeModule.KEY_WORKOUTS_COUNT, 0)
      val lastUpdated = prefs.getString(GainTrackWidgetBridgeModule.KEY_LAST_UPDATED, "") ?: ""

      val volumeText = "\${formatVolume(weeklyVolume)} kg"
      val updatedPrefix = context.getString(R.string.gaintrack_widget_last_updated_prefix)
      val updatedText = if (lastUpdated.isNotBlank()) "${'$'}updatedPrefix ${'$'}lastUpdated" else ""

      val views = RemoteViews(context.packageName, R.layout.gaintrack_wide_widget)
      views.setTextViewText(R.id.wide_volume_value, volumeText)
      views.setTextViewText(R.id.wide_workouts_value, workoutsCount.toString())
      views.setTextViewText(R.id.wide_last_updated, updatedText)

      createLaunchPendingIntent(context)?.let { views.setOnClickPendingIntent(R.id.wide_widget_root, it) }
      appWidgetManager.updateAppWidget(appWidgetId, views)
    }

    private fun createLaunchPendingIntent(context: Context): PendingIntent? {
      val intent = context.packageManager
        .getLaunchIntentForPackage(context.packageName)
        ?.apply { flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP }
        ?: return null
      // Use request code 1 to avoid PendingIntent collision with the compact widget
      return PendingIntent.getActivity(
        context, 1, intent,
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
      )
    }

    private fun formatVolume(volume: Long): String =
      NumberFormat.getIntegerInstance(Locale.getDefault()).format(volume)
  }
}
`;

// ---------------------------------------------------------------------------
// XML resource files
// ---------------------------------------------------------------------------

const STATS_WIDGET_LAYOUT_XML = `<?xml version="1.0" encoding="utf-8"?>
<LinearLayout xmlns:android="http://schemas.android.com/apk/res/android"
  android:id="@+id/widget_root"
  android:layout_width="match_parent"
  android:layout_height="match_parent"
  android:background="@drawable/gaintrack_widget_background"
  android:gravity="center_vertical"
  android:orientation="vertical">

  <TextView
    android:id="@+id/widget_title"
    android:layout_width="wrap_content"
    android:layout_height="wrap_content"
    android:text="@string/gaintrack_widget_title"
    android:textColor="#B0B0B0"
    android:textSize="12sp"
    android:textStyle="bold" />

  <TextView
    android:id="@+id/widget_volume_value"
    android:layout_width="wrap_content"
    android:layout_height="wrap_content"
    android:layout_marginTop="4dp"
    android:text="0 kg"
    android:textColor="#FFFFFF"
    android:textSize="24sp"
    android:textStyle="bold" />

  <LinearLayout
    android:layout_width="wrap_content"
    android:layout_height="wrap_content"
    android:layout_marginTop="8dp"
    android:gravity="center_vertical"
    android:orientation="horizontal">

    <TextView
      android:id="@+id/widget_workouts_label"
      android:layout_width="wrap_content"
      android:layout_height="wrap_content"
      android:text="@string/gaintrack_widget_workouts_label"
      android:textColor="#B0B0B0"
      android:textSize="12sp" />

    <TextView
      android:id="@+id/widget_workouts_value"
      android:layout_width="wrap_content"
      android:layout_height="wrap_content"
      android:layout_marginStart="6dp"
      android:text="0"
      android:textColor="#FF6200"
      android:textSize="14sp"
      android:textStyle="bold" />

  </LinearLayout>

  <TextView
    android:id="@+id/widget_last_updated"
    android:layout_width="wrap_content"
    android:layout_height="wrap_content"
    android:layout_marginTop="8dp"
    android:text=""
    android:textColor="#7F7F7F"
    android:textSize="10sp" />

</LinearLayout>
`;

const WIDE_WIDGET_LAYOUT_XML = `<?xml version="1.0" encoding="utf-8"?>
<LinearLayout xmlns:android="http://schemas.android.com/apk/res/android"
  android:id="@+id/wide_widget_root"
  android:layout_width="match_parent"
  android:layout_height="match_parent"
  android:background="@drawable/gaintrack_widget_background"
  android:gravity="center_vertical"
  android:orientation="horizontal"
  android:weightSum="2">

  <!-- Left pane: Weekly volume -->
  <LinearLayout
    android:layout_width="0dp"
    android:layout_height="wrap_content"
    android:layout_weight="1"
    android:gravity="center_horizontal"
    android:orientation="vertical">

    <TextView
      android:layout_width="wrap_content"
      android:layout_height="wrap_content"
      android:text="@string/gaintrack_widget_title"
      android:textColor="#B0B0B0"
      android:textSize="11sp"
      android:textStyle="bold" />

    <TextView
      android:id="@+id/wide_volume_value"
      android:layout_width="wrap_content"
      android:layout_height="wrap_content"
      android:layout_marginTop="4dp"
      android:text="0 kg"
      android:textColor="#FFFFFF"
      android:textSize="26sp"
      android:textStyle="bold" />

  </LinearLayout>

  <!-- Vertical divider -->
  <View
    android:layout_width="1dp"
    android:layout_height="match_parent"
    android:layout_marginBottom="12dp"
    android:layout_marginTop="12dp"
    android:background="#303030" />

  <!-- Right pane: Workouts + last updated -->
  <LinearLayout
    android:layout_width="0dp"
    android:layout_height="wrap_content"
    android:layout_weight="1"
    android:gravity="center_horizontal"
    android:orientation="vertical">

    <TextView
      android:layout_width="wrap_content"
      android:layout_height="wrap_content"
      android:text="@string/gaintrack_widget_workouts_label"
      android:textColor="#B0B0B0"
      android:textSize="11sp"
      android:textStyle="bold" />

    <TextView
      android:id="@+id/wide_workouts_value"
      android:layout_width="wrap_content"
      android:layout_height="wrap_content"
      android:layout_marginTop="4dp"
      android:text="0"
      android:textColor="#FF6200"
      android:textSize="26sp"
      android:textStyle="bold" />

    <TextView
      android:id="@+id/wide_last_updated"
      android:layout_width="wrap_content"
      android:layout_height="wrap_content"
      android:layout_marginTop="8dp"
      android:text=""
      android:textColor="#7F7F7F"
      android:textSize="10sp" />

  </LinearLayout>

</LinearLayout>
`;

const WIDGET_BACKGROUND_DRAWABLE_XML = `<?xml version="1.0" encoding="utf-8"?>
<shape xmlns:android="http://schemas.android.com/apk/res/android" android:shape="rectangle">
  <corners android:radius="18dp" />
  <solid android:color="#252525" />
  <stroke android:width="1dp" android:color="#FF6200" />
  <padding android:left="12dp" android:top="12dp" android:right="12dp" android:bottom="12dp" />
</shape>
`;

const STATS_WIDGET_INFO_XML = `<?xml version="1.0" encoding="utf-8"?>
<appwidget-provider xmlns:android="http://schemas.android.com/apk/res/android"
  android:description="@string/gaintrack_widget_label"
  android:initialLayout="@layout/gaintrack_stats_widget"
  android:minWidth="180dp"
  android:minHeight="110dp"
  android:previewLayout="@layout/gaintrack_stats_widget"
  android:resizeMode="horizontal|vertical"
  android:targetCellWidth="3"
  android:targetCellHeight="2"
  android:updatePeriodMillis="0"
  android:widgetCategory="home_screen" />
`;

const WIDE_WIDGET_INFO_XML = `<?xml version="1.0" encoding="utf-8"?>
<appwidget-provider xmlns:android="http://schemas.android.com/apk/res/android"
  android:description="@string/gaintrack_wide_widget_label"
  android:initialLayout="@layout/gaintrack_wide_widget"
  android:minWidth="250dp"
  android:minHeight="110dp"
  android:previewLayout="@layout/gaintrack_wide_widget"
  android:resizeMode="horizontal|vertical"
  android:targetCellWidth="4"
  android:targetCellHeight="2"
  android:updatePeriodMillis="0"
  android:widgetCategory="home_screen" />
`;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function writeIfChanged(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  // Only write when content actually differs — avoids touching timestamps
  const existing = fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : null;
  if (existing !== content) {
    fs.writeFileSync(filePath, content, 'utf8');
  }
}

// ---------------------------------------------------------------------------
// Mod: AndroidManifest — add both widget receiver declarations
// ---------------------------------------------------------------------------

function withWidgetManifest(config) {
  return withAndroidManifest(config, (mod) => {
    const application = mod.modResults.manifest?.application?.[0];
    if (!application) return mod;

    const receivers = application.receiver ?? [];

    const STATS_NAME = '.widget.GainTrackStatsWidgetProvider';
    const WIDE_NAME = '.widget.GainTrackWideWidgetProvider';

    if (!receivers.some((r) => r?.$?.['android:name'] === STATS_NAME)) {
      receivers.push({
        $: { 'android:name': STATS_NAME, 'android:exported': 'false' },
        'intent-filter': [
          { action: [{ $: { 'android:name': 'android.appwidget.action.APPWIDGET_UPDATE' } }] },
        ],
        'meta-data': [
          {
            $: {
              'android:name': 'android.appwidget.provider',
              'android:resource': '@xml/gaintrack_stats_widget_info',
            },
          },
        ],
      });
    }

    if (!receivers.some((r) => r?.$?.['android:name'] === WIDE_NAME)) {
      receivers.push({
        $: { 'android:name': WIDE_NAME, 'android:exported': 'false' },
        'intent-filter': [
          { action: [{ $: { 'android:name': 'android.appwidget.action.APPWIDGET_UPDATE' } }] },
        ],
        'meta-data': [
          {
            $: {
              'android:name': 'android.appwidget.provider',
              'android:resource': '@xml/gaintrack_wide_widget_info',
            },
          },
        ],
      });
    }

    application.receiver = receivers;
    return mod;
  });
}

// ---------------------------------------------------------------------------
// Mod: strings.xml — add widget labels
// ---------------------------------------------------------------------------

const WIDGET_STRINGS = [
  { name: 'gaintrack_widget_label', value: 'GainTrack Weekly Volume' },
  { name: 'gaintrack_widget_title', value: 'Weekly Volume' },
  { name: 'gaintrack_widget_workouts_label', value: 'Workouts (7d)' },
  { name: 'gaintrack_widget_last_updated_prefix', value: 'Updated' },
  { name: 'gaintrack_wide_widget_label', value: 'GainTrack Training Stats' },
];

function withWidgetStrings(config) {
  return withStringsXml(config, (mod) => {
    const strings = mod.modResults.resources.string ?? [];
    for (const entry of WIDGET_STRINGS) {
      if (!strings.some((s) => s?.$?.name === entry.name)) {
        strings.push({ $: { name: entry.name }, _: entry.value });
      }
    }
    mod.modResults.resources.string = strings;
    return mod;
  });
}

// ---------------------------------------------------------------------------
// Mod: MainApplication.kt — register GainTrackWidgetBridgePackage
// ---------------------------------------------------------------------------

function withWidgetMainApplication(config) {
  return withMainApplication(config, (mod) => {
    if (mod.modResults.language !== 'kt') return mod;

    let src = mod.modResults.contents;

    const IMPORT_LINE = 'import com.tsag89ops.gaintrack.widget.GainTrackWidgetBridgePackage';
    if (!src.includes(IMPORT_LINE)) {
      // Insert after the package declaration line
      src = src.replace(
        /^(package com\.tsag89ops\.gaintrack\s*\n)/m,
        `$1\n${IMPORT_LINE}\n`,
      );
    }

    const ADD_LINE = 'add(GainTrackWidgetBridgePackage())';
    if (!src.includes(ADD_LINE)) {
      src = src.replace(
        /PackageList\(this\)\.packages\.apply \{/,
        `PackageList(this).packages.apply {\n              ${ADD_LINE}`,
      );
    }

    mod.modResults.contents = src;
    return mod;
  });
}

// ---------------------------------------------------------------------------
// Mod: write Kotlin source + XML resource files (dangerous mod)
// ---------------------------------------------------------------------------

function withWidgetFiles(config) {
  return withDangerousMod(config, [
    'android',
    (config) => {
      const root = config.modRequest.projectRoot;

      const widgetDir = path.join(root, WIDGET_JAVA_DIR);
      const layoutDir = path.join(root, RES_LAYOUT_DIR);
      const drawableDir = path.join(root, RES_DRAWABLE_DIR);
      const xmlDir = path.join(root, RES_XML_DIR);

      // Kotlin sources
      writeIfChanged(path.join(widgetDir, 'GainTrackWidgetBridgePackage.kt'), BRIDGE_PACKAGE_KT);
      writeIfChanged(path.join(widgetDir, 'GainTrackWidgetBridgeModule.kt'), BRIDGE_MODULE_KT);
      writeIfChanged(path.join(widgetDir, 'GainTrackStatsWidgetProvider.kt'), STATS_WIDGET_PROVIDER_KT);
      writeIfChanged(path.join(widgetDir, 'GainTrackWideWidgetProvider.kt'), WIDE_WIDGET_PROVIDER_KT);

      // Layouts
      writeIfChanged(path.join(layoutDir, 'gaintrack_stats_widget.xml'), STATS_WIDGET_LAYOUT_XML);
      writeIfChanged(path.join(layoutDir, 'gaintrack_wide_widget.xml'), WIDE_WIDGET_LAYOUT_XML);

      // Drawable
      writeIfChanged(
        path.join(drawableDir, 'gaintrack_widget_background.xml'),
        WIDGET_BACKGROUND_DRAWABLE_XML,
      );

      // Widget metadata descriptors
      writeIfChanged(path.join(xmlDir, 'gaintrack_stats_widget_info.xml'), STATS_WIDGET_INFO_XML);
      writeIfChanged(path.join(xmlDir, 'gaintrack_wide_widget_info.xml'), WIDE_WIDGET_INFO_XML);

      return config;
    },
  ]);
}

// ---------------------------------------------------------------------------
// Combined plugin
// ---------------------------------------------------------------------------

function withGainTrackWidget(config) {
  config = withWidgetManifest(config);
  config = withWidgetStrings(config);
  config = withWidgetMainApplication(config);
  config = withWidgetFiles(config);
  return config;
}

module.exports = createRunOncePlugin(withGainTrackWidget, PACKAGE_NAME, PACKAGE_VERSION);
