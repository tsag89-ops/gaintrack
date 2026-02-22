# GainTrack - Development Build Instructions

This guide explains how to create development builds for Android and iOS on your local machine.

## Prerequisites

### For Android Development:
- **Android Studio** (Arctic Fox or later)
- **Java Development Kit (JDK) 17+**
- **Android SDK** (API Level 33+)
- Environment variables configured:
  ```bash
  export ANDROID_HOME=$HOME/Android/Sdk
  export PATH=$PATH:$ANDROID_HOME/emulator
  export PATH=$PATH:$ANDROID_HOME/platform-tools
  ```

### For iOS Development (macOS only):
- **Xcode 15+** with iOS 17+ SDK
- **Xcode Command Line Tools**: `xcode-select --install`
- **CocoaPods**: `sudo gem install cocoapods`
- An Apple Developer account (free tier works for development)

## Step-by-Step Build Instructions

### 1. Clone and Install Dependencies

```bash
cd frontend
yarn install
```

### 2. Generate Native Projects (Prebuild)

This creates the `android/` and `ios/` directories with native code:

```bash
# Generate both platforms
yarn prebuild

# Or generate with clean (removes existing native folders first)
yarn prebuild:clean
```

### 3. Build for Android

#### Option A: Development Build (Debug)
```bash
# Opens Android emulator/device and builds
yarn android

# Or explicitly build debug APK
yarn build:android
```

#### Option B: Release Build (Production)
```bash
yarn build:android:release
```

#### Manual APK Location:
After building, the APK will be at:
- Debug: `android/app/build/outputs/apk/debug/app-debug.apk`
- Release: `android/app/build/outputs/apk/release/app-release.apk`

### 4. Build for iOS (macOS only)

#### Option A: Development Build
```bash
# Install CocoaPods dependencies first
cd ios && pod install && cd ..

# Build and run on simulator/device
yarn ios

# Or explicitly build
yarn build:ios
```

#### Option B: Release Build
```bash
yarn build:ios:release
```

## Running the Development Build

### On Android:
1. Install the APK on your device/emulator:
   ```bash
   adb install android/app/build/outputs/apk/debug/app-debug.apk
   ```
2. Open the GainTrack app
3. The app will automatically connect to Metro bundler

### On iOS:
1. The app will open in Simulator after build
2. For physical device: Open Xcode project in `ios/` folder, configure signing, and run

### Connecting to Development Server:
After installing the dev build, start the Metro bundler:
```bash
yarn start
```

The app will connect automatically. If not:
- **Android**: Shake device → Settings → Enter your computer's IP
- **iOS**: Shake device → Configure Bundler

## Development Build vs Expo Go

| Feature | Expo Go | Development Build |
|---------|---------|-------------------|
| Push Notifications | ❌ Limited | ✅ Full support |
| Native modules | ❌ Limited | ✅ All supported |
| App Store submission | ❌ No | ✅ Yes |
| Custom native code | ❌ No | ✅ Yes |
| Installation | Expo Go app | Custom APK/IPA |

## Troubleshooting

### Android Issues:

**"SDK location not found"**
Create `android/local.properties` with:
```
sdk.dir=/path/to/Android/Sdk
```

**Build fails with memory error**
Add to `android/gradle.properties`:
```
org.gradle.jvmargs=-Xmx4096m
```

### iOS Issues:

**Pod install fails**
```bash
cd ios
pod deintegrate
pod cache clean --all
pod install
```

**Signing issues**
Open `ios/GainTrack.xcworkspace` in Xcode, go to Signing & Capabilities, and select your team.

## Available Scripts

| Script | Description |
|--------|-------------|
| `yarn start` | Start Metro bundler |
| `yarn android` | Run on Android |
| `yarn ios` | Run on iOS |
| `yarn prebuild` | Generate native projects |
| `yarn prebuild:clean` | Regenerate native projects |
| `yarn build:android` | Build Android debug APK |
| `yarn build:ios` | Build iOS debug app |
| `yarn build:android:release` | Build Android release APK |
| `yarn build:ios:release` | Build iOS release app |

## Features Requiring Development Build

The following features only work in a development build (not Expo Go):

1. **Push Notifications** - Full local notification scheduling
2. **Background tasks** - Workout reminders even when app is closed
3. **Native modules** - Any custom native functionality

## Need Help?

If you encounter issues:
1. Check the Expo documentation: https://docs.expo.dev/develop/development-builds/create-a-build/
2. Ensure all prerequisites are installed
3. Try `yarn prebuild:clean` to regenerate native projects
