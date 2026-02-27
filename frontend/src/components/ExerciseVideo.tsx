// frontend/app/components/ExerciseVideo.tsx
import React from 'react';
import {
  View,
  StyleSheet,
  Dimensions,
  Platform,
  Text,
  TouchableOpacity,
  Linking,
} from 'react-native';
import { WebView } from 'react-native-webview';

interface ExerciseVideoProps {
  videoUrl: string;
}

const { width } = Dimensions.get('window');

export const ExerciseVideo: React.FC<ExerciseVideoProps> = ({ videoUrl }) => {
  // On web, show a simple link instead of WebView to avoid the platform error
  if (Platform.OS === 'web') {
    const handleOpen = () => {
      Linking.openURL(videoUrl);
    };

    return (
      <View style={styles.webContainer}>
        <Text style={styles.webText}>
          Video preview works best on your phone. You can also open it in a new tab:
        </Text>
        <TouchableOpacity onPress={handleOpen} style={styles.webButton}>
          <Text style={styles.webButtonText}>Open exercise video</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // Native (Android/iOS): use WebView
  return (
    <View style={styles.container}>
      <WebView
        source={{ uri: videoUrl }}
        style={styles.video}
        allowsFullscreenVideo
        javaScriptEnabled
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: width - 32,
    height: 200,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#000',
  },
  video: {
    flex: 1,
  },
  webContainer: {
    width: width - 32,
    padding: 12,
    borderRadius: 12,
    backgroundColor: '#1F2937',
  },
  webText: {
    color: '#E5E7EB',
    fontSize: 14,
    marginBottom: 8,
  },
  webButton: {
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#10B981',
    borderRadius: 8,
  },
  webButtonText: {
    color: '#111827',
    fontWeight: '600',
    fontSize: 14,
  },
});
