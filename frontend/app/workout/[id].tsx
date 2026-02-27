
import React, { useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, KeyboardAvoidingView, Platform, Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';


const NOTES_KEY = 'workout_notes';

export default function WorkoutDetailScreen() {
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);

  // Load notes from AsyncStorage on mount
  React.useEffect(() => {
    const loadNotes = async () => {
      try {
        const saved = await AsyncStorage.getItem(NOTES_KEY);
        if (saved) setNotes(saved);
      } catch (e) {
        // ignore
      }
    };
    loadNotes();
  }, []);

  const saveNotes = async () => {
    setLoading(true);
    try {
      await AsyncStorage.setItem(NOTES_KEY, notes);
      Alert.alert('Notes saved!');
    } catch (e) {
      Alert.alert('Error saving notes');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Text style={styles.title}>Workout Detail Screen</Text>
      <View style={styles.notesCard}>
        <Text style={styles.notesTitle}>Workout Notes</Text>
        <TextInput
          style={styles.notesInput}
          placeholder="Add your notes here..."
          placeholderTextColor="#888"
          value={notes}
          onChangeText={setNotes}
          multiline
        />
        <TouchableOpacity
          style={styles.saveButton}
          onPress={saveNotes}
          disabled={loading}
        >
          <Text style={styles.saveButtonText}>{loading ? 'Saving...' : 'Save Notes'}</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#121212', // dark mode default
    padding: 16,
  },
  title: {
    color: '#fff',
    fontSize: 22,
    fontWeight: 'bold',
    marginBottom: 24,
  },
  notesCard: {
    width: '100%',
    backgroundColor: '#1F2937',
    borderRadius: 10,
    padding: 16,
    marginBottom: 24,
  },
  notesTitle: {
    color: '#FBBF24',
    fontWeight: 'bold',
    fontSize: 16,
    marginBottom: 8,
  },
  notesInput: {
    color: '#fff',
    backgroundColor: '#111827',
    borderRadius: 6,
    padding: 10,
    minHeight: 60,
    borderWidth: 1,
    borderColor: '#374151',
    marginBottom: 12,
    fontSize: 15,
  },
  saveButton: {
    backgroundColor: '#10B981',
    paddingVertical: 10,
    borderRadius: 6,
    alignItems: 'center',
  },
  saveButtonText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 16,
  },
});