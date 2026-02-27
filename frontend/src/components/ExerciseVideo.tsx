import React from 'react';
import { View, StyleSheet, Dimensions } from 'react-native';
import { WebView } from 'react-native-webview';

interface ExerciseVideoProps {
  videoUrl: string;
}

export const ExerciseVideo: React.FC<ExerciseVideoProps> = ({ videoUrl }) => {
  return (
    <View style={styles.container}>
      <WebView
        source={{ uri: videoUrl }}
        style={styles.webview}
        javaScriptEnabled
        domStorageEnabled
        allowsFullscreenVideo
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: '100%',
    aspectRatio: 16 / 9,
    borderRadius: 8,
    overflow: 'hidden',
    marginBottom: 12,
  },
  webview: {
    flex: 1,
    borderRadius: 8,
  },
});
