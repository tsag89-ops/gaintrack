import React from 'react';
import { View, StyleSheet, Dimensions } from 'react-native';
import { WebView } from 'react-native-webview';

interface ExerciseVideoProps {
  videoUrl: string;
}

const { width } = Dimensions.get('window');

export const ExerciseVideo: React.FC<ExerciseVideoProps> = ({ videoUrl }) => {
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
});
