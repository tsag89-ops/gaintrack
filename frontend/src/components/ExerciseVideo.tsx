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
import { useLanguage } from '../context/LanguageContext';

interface ExerciseVideoProps {
  videoUrl: string;
}

const { width } = Dimensions.get('window');

export const ExerciseVideo: React.FC<ExerciseVideoProps> = ({ videoUrl }) => {
  const { t } = useLanguage();
  // On web, show a simple link instead of WebView to avoid the platform error
  if (Platform.OS === 'web') {
    const handleOpen = () => {
      Linking.openURL(videoUrl);
    };

    return (
      <View style={styles.webContainer}>
        <Text style={styles.webText}>
          {t('exerciseVideo.webPreviewHint')}
        </Text>
        <TouchableOpacity onPress={handleOpen} style={styles.webButton}>
          <Text style={styles.webButtonText}>{t('exerciseVideo.openVideoButton')}</Text>
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
    backgroundColor: '#252525',
  },
  webText: {
    color: '#FFFFFF',
    fontSize: 14,
    marginBottom: 8,
  },
  webButton: {
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#4CAF50',
    borderRadius: 8,
  },
  webButtonText: {
    color: '#1A1A1A',
    fontWeight: '600',
    fontSize: 14,
  },
});
