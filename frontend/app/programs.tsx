import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Modal,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL || '';

interface WorkoutTemplate {
  template_id: string;
  name: string;
  description: string;
  difficulty: string;
  duration_weeks: number;
  workouts_per_week: number;
  type: string;
  exercises: any[];
}

const DIFFICULTY_COLORS: Record<string, string> = {
  beginner: '#10B981',
  intermediate: '#F59E0B',
  advanced: '#EF4444',
};

const TYPE_ICONS: Record<string, string> = {
  strength: 'barbell',
  hypertrophy: 'body',
  power: 'flash',
  endurance: 'pulse',
};

export default function ProgramsScreen() {
  const router = useRouter();
  const [templates, setTemplates] = useState<WorkoutTemplate[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<WorkoutTemplate | null>(null);
  const [showDetails, setShowDetails] = useState(false);
  const [isStarting, setIsStarting] = useState(false);

  const fetchTemplates = useCallback(async () => {
    try {
      setIsLoading(true);
      const response = await axios.get(`${API_URL}/api/templates`);
      setTemplates(response.data);
    } catch (error) {
      console.error('Error fetching templates:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTemplates();
  }, [fetchTemplates]);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchTemplates();
    setRefreshing(false);
  };

  const handleTemplatePress = (template: WorkoutTemplate) => {
    setSelectedTemplate(template);
    setShowDetails(true);
  };

  const handleStartProgram = async () => {
    if (!selectedTemplate) return;

    try {
      setIsStarting(true);
      const token = await AsyncStorage.getItem('sessionToken');
      
      const response = await axios.post(
        `${API_URL}/api/templates/${selectedTemplate.template_id}/start`,
        {},
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      setShowDetails(false);
      Alert.alert(
        'Program Started!',
        `Your first ${selectedTemplate.name} workout has been created.`,
        [
          {
            text: 'Go to Workout',
            onPress: () => router.push(`/workout/${response.data.workout_id}`),
          },
          { text: 'OK' },
        ]
      );
    } catch (error) {
      console.error('Error starting program:', error);
      Alert.alert('Error', 'Please log in to start a program');
    } finally {
      setIsStarting(false);
    }
  };

  const getDifficultyIcon = (difficulty: string) => {
    switch (difficulty) {
      case 'beginner':
        return '1';
      case 'intermediate':
        return '2';
      case 'advanced':
        return '3';
      default:
        return '?';
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="chevron-back" size={28} color="#FFFFFF" />
        </TouchableOpacity>
        <View>
          <Text style={styles.headerTitle}>Programs</Text>
          <Text style={styles.headerSubtitle}>Pre-built workout templates</Text>
        </View>
      </View>

      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#10B981" />
        </View>
      ) : (
        <ScrollView
          style={styles.content}
          contentContainerStyle={styles.scrollContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#10B981" />
          }
        >
          {templates.map((template) => (
            <TouchableOpacity
              key={template.template_id}
              style={styles.templateCard}
              onPress={() => handleTemplatePress(template)}
              activeOpacity={0.7}
            >
              <View style={styles.templateHeader}>
                <View style={styles.templateIcon}>
                  <Ionicons
                    name={(TYPE_ICONS[template.type] || 'barbell') as any}
                    size={24}
                    color="#FFFFFF"
                  />
                </View>
                <View style={styles.templateInfo}>
                  <Text style={styles.templateName}>{template.name}</Text>
                  <View style={styles.templateMeta}>
                    <View
                      style={[
                        styles.difficultyBadge,
                        { backgroundColor: DIFFICULTY_COLORS[template.difficulty] + '30' },
                      ]}
                    >
                      <Text
                        style={[
                          styles.difficultyText,
                          { color: DIFFICULTY_COLORS[template.difficulty] },
                        ]}
                      >
                        {template.difficulty}
                      </Text>
                    </View>
                    <Text style={styles.metaText}>
                      {template.workouts_per_week}x/week • {template.duration_weeks} weeks
                    </Text>
                  </View>
                </View>
                <Ionicons name="chevron-forward" size={20} color="#6B7280" />
              </View>

              <Text style={styles.templateDesc} numberOfLines={2}>
                {template.description}
              </Text>

              <View style={styles.templateStats}>
                <View style={styles.statItem}>
                  <Ionicons name="calendar-outline" size={16} color="#6B7280" />
                  <Text style={styles.statText}>{template.duration_weeks} weeks</Text>
                </View>
                <View style={styles.statItem}>
                  <Ionicons name="repeat-outline" size={16} color="#6B7280" />
                  <Text style={styles.statText}>{template.workouts_per_week} days/week</Text>
                </View>
                <View style={styles.statItem}>
                  <Ionicons name="fitness-outline" size={16} color="#6B7280" />
                  <Text style={styles.statText}>{template.type}</Text>
                </View>
              </View>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      {/* Template Details Modal */}
      <Modal visible={showDetails} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHandle} />

            {selectedTemplate && (
              <>
                <View style={styles.modalHeader}>
                  <Text style={styles.modalTitle}>{selectedTemplate.name}</Text>
                  <TouchableOpacity onPress={() => setShowDetails(false)}>
                    <Ionicons name="close" size={24} color="#9CA3AF" />
                  </TouchableOpacity>
                </View>

                <ScrollView style={styles.modalScroll}>
                  <Text style={styles.modalDescription}>{selectedTemplate.description}</Text>

                  <View style={styles.modalStats}>
                    <View style={styles.modalStatItem}>
                      <Text style={styles.modalStatValue}>{selectedTemplate.duration_weeks}</Text>
                      <Text style={styles.modalStatLabel}>Weeks</Text>
                    </View>
                    <View style={styles.modalStatItem}>
                      <Text style={styles.modalStatValue}>{selectedTemplate.workouts_per_week}</Text>
                      <Text style={styles.modalStatLabel}>Days/Week</Text>
                    </View>
                    <View style={styles.modalStatItem}>
                      <Text
                        style={[
                          styles.modalStatValue,
                          { color: DIFFICULTY_COLORS[selectedTemplate.difficulty] },
                        ]}
                      >
                        {selectedTemplate.difficulty.charAt(0).toUpperCase()}
                      </Text>
                      <Text style={styles.modalStatLabel}>Difficulty</Text>
                    </View>
                  </View>

                  <Text style={styles.sectionTitle}>Workout Schedule</Text>
                  {selectedTemplate.exercises.map((day, index) => (
                    <View key={index} style={styles.dayCard}>
                      <Text style={styles.dayTitle}>Day {day.day}</Text>
                      {day.exercises.map((ex: any, exIndex: number) => (
                        <View key={exIndex} style={styles.exerciseRow}>
                          <Text style={styles.exerciseName}>{ex.name}</Text>
                          <Text style={styles.exerciseDetails}>
                            {ex.sets}x{ex.reps}
                          </Text>
                        </View>
                      ))}
                    </View>
                  ))}
                </ScrollView>

                <TouchableOpacity
                  style={[styles.startButton, isStarting && styles.startButtonDisabled]}
                  onPress={handleStartProgram}
                  disabled={isStarting}
                >
                  <Ionicons name="play" size={22} color="#FFFFFF" />
                  <Text style={styles.startButtonText}>
                    {isStarting ? 'Starting...' : 'Start Program'}
                  </Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#111827',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
  },
  backButton: {
    padding: 4,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  headerSubtitle: {
    fontSize: 14,
    color: '#6B7280',
    marginTop: 2,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  templateCard: {
    backgroundColor: '#1F2937',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
  },
  templateHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  templateIcon: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: '#10B981',
    justifyContent: 'center',
    alignItems: 'center',
  },
  templateInfo: {
    flex: 1,
    marginLeft: 12,
  },
  templateName: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
  },
  templateMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
    gap: 8,
  },
  difficultyBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  difficultyText: {
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  metaText: {
    color: '#6B7280',
    fontSize: 12,
  },
  templateDesc: {
    color: '#9CA3AF',
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 12,
  },
  templateStats: {
    flexDirection: 'row',
    gap: 16,
  },
  statItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  statText: {
    color: '#6B7280',
    fontSize: 12,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#1F2937',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    paddingBottom: 34,
    maxHeight: '85%',
  },
  modalHandle: {
    width: 40,
    height: 4,
    backgroundColor: '#4B5563',
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 20,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  modalTitle: {
    color: '#FFFFFF',
    fontSize: 24,
    fontWeight: '800',
  },
  modalScroll: {
    maxHeight: 400,
  },
  modalDescription: {
    color: '#9CA3AF',
    fontSize: 14,
    lineHeight: 22,
    marginBottom: 20,
  },
  modalStats: {
    flexDirection: 'row',
    backgroundColor: '#111827',
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
  },
  modalStatItem: {
    flex: 1,
    alignItems: 'center',
  },
  modalStatValue: {
    color: '#FFFFFF',
    fontSize: 24,
    fontWeight: '800',
  },
  modalStatLabel: {
    color: '#6B7280',
    fontSize: 12,
    marginTop: 4,
  },
  sectionTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 12,
  },
  dayCard: {
    backgroundColor: '#111827',
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
  },
  dayTitle: {
    color: '#10B981',
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 10,
  },
  exerciseRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#1F2937',
  },
  exerciseName: {
    color: '#FFFFFF',
    fontSize: 14,
  },
  exerciseDetails: {
    color: '#6B7280',
    fontSize: 14,
  },
  startButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#10B981',
    paddingVertical: 16,
    borderRadius: 12,
    marginTop: 16,
    gap: 8,
  },
  startButtonDisabled: {
    opacity: 0.7,
  },
  startButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
});
