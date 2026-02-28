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
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { measurementsApi } from '../src/services/api';
import { format } from 'date-fns';

interface Measurement {
  measurement_id: string;
  date: string;
  weight?: number;
  body_fat?: number;
  chest?: number;
  waist?: number;
  hips?: number;
  biceps_left?: number;
  biceps_right?: number;
  thighs_left?: number;
  thighs_right?: number;
  shoulders?: number;
  neck?: number;
  notes?: string;
}

interface MeasurementProgress {
  first: number;
  latest: number;
  change: number;
  change_percent: number;
}

const MEASUREMENT_FIELDS = [
  { key: 'weight', label: 'Weight', unit: 'lbs', icon: 'scale-outline' },
  { key: 'body_fat', label: 'Body Fat', unit: '%', icon: 'fitness-outline' },
  { key: 'chest', label: 'Chest', unit: 'in', icon: 'body-outline' },
  { key: 'waist', label: 'Waist', unit: 'in', icon: 'body-outline' },
  { key: 'hips', label: 'Hips', unit: 'in', icon: 'body-outline' },
  { key: 'shoulders', label: 'Shoulders', unit: 'in', icon: 'body-outline' },
  { key: 'biceps_left', label: 'Left Bicep', unit: 'in', icon: 'fitness-outline' },
  { key: 'biceps_right', label: 'Right Bicep', unit: 'in', icon: 'fitness-outline' },
  { key: 'thighs_left', label: 'Left Thigh', unit: 'in', icon: 'body-outline' },
  { key: 'thighs_right', label: 'Right Thigh', unit: 'in', icon: 'body-outline' },
  { key: 'neck', label: 'Neck', unit: 'in', icon: 'body-outline' },
];

export default function MeasurementsScreen() {
  const router = useRouter();
  const [measurements, setMeasurements] = useState<Measurement[]>([]);
  const [progress, setProgress] = useState<Record<string, MeasurementProgress>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [newMeasurement, setNewMeasurement] = useState<Record<string, string>>({});
  const [activeTab, setActiveTab] = useState<'history' | 'progress'>('history');

  const fetchData = useCallback(async () => {
    try {
      setIsLoading(true);
      const [measurementsData, progressData] = await Promise.all([
        measurementsApi.getAll(30),
        measurementsApi.getProgress(90),
      ]);
      setMeasurements(measurementsData);
      setProgress((progressData as any)?.changes || {});
    } catch (error) {
      console.error('Error fetching measurements:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchData();
    setRefreshing(false);
  };

  const handleSave = async () => {
    // Check if at least one field has a value
    const hasValue = Object.values(newMeasurement).some(v => v && v.trim() !== '');
    if (!hasValue) {
      Alert.alert('Error', 'Please enter at least one measurement');
      return;
    }

    try {
      setIsSaving(true);
      const data: Record<string, any> = {};
      
      for (const field of MEASUREMENT_FIELDS) {
        const value = newMeasurement[field.key];
        if (value && value.trim() !== '') {
          data[field.key] = parseFloat(value);
        }
      }
      
      if (newMeasurement.notes) {
        data.notes = newMeasurement.notes;
      }

      await measurementsApi.create(data);
      setShowAddModal(false);
      setNewMeasurement({});
      await fetchData();
      Alert.alert('Success', 'Measurement saved!');
    } catch (error) {
      console.error('Error saving measurement:', error);
      Alert.alert('Error', 'Failed to save measurement');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (date: string) => {
    Alert.alert('Delete Measurement', 'Are you sure you want to delete this measurement?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await measurementsApi.delete(date);
            await fetchData();
          } catch (error) {
            console.error('Error deleting measurement:', error);
            Alert.alert('Error', 'Failed to delete measurement');
          }
        },
      },
    ]);
  };

  const formatDate = (dateStr: string) => {
    return format(new Date(dateStr), 'MMM d, yyyy');
  };

  const getChangeColor = (change: number) => {
    // For measurements where decrease is good (weight, waist, body fat)
    return change < 0 ? '#10B981' : change > 0 ? '#EF4444' : '#6B7280';
  };

  const getGainColor = (change: number) => {
    // For measurements where increase is good (biceps, chest, etc)
    return change > 0 ? '#10B981' : change < 0 ? '#EF4444' : '#6B7280';
  };

  const isDecreaseGood = (key: string) => {
    return ['weight', 'waist', 'body_fat', 'hips'].includes(key);
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="chevron-back" size={28} color="#FFFFFF" />
        </TouchableOpacity>
        <View style={styles.headerText}>
          <Text style={styles.headerTitle}>Body Measurements</Text>
          <Text style={styles.headerSubtitle}>Track your progress</Text>
        </View>
        <TouchableOpacity style={styles.addButton} onPress={() => setShowAddModal(true)}>
          <Ionicons name="add" size={24} color="#FFFFFF" />
        </TouchableOpacity>
      </View>

      {/* Tab Selector */}
      <View style={styles.tabSelector}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'history' && styles.activeTab]}
          onPress={() => setActiveTab('history')}
        >
          <Ionicons
            name="list-outline"
            size={18}
            color={activeTab === 'history' ? '#FFFFFF' : '#6B7280'}
          />
          <Text style={[styles.tabText, activeTab === 'history' && styles.activeTabText]}>
            History
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'progress' && styles.activeTab]}
          onPress={() => setActiveTab('progress')}
        >
          <Ionicons
            name="analytics-outline"
            size={18}
            color={activeTab === 'progress' ? '#FFFFFF' : '#6B7280'}
          />
          <Text style={[styles.tabText, activeTab === 'progress' && styles.activeTabText]}>
            Progress
          </Text>
        </TouchableOpacity>
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
          {activeTab === 'history' ? (
            <>
              {measurements.length === 0 ? (
                <View style={styles.emptyState}>
                  <Ionicons name="body-outline" size={64} color="#374151" />
                  <Text style={styles.emptyTitle}>No measurements yet</Text>
                  <Text style={styles.emptySubtitle}>
                    Start tracking your body measurements to see progress over time
                  </Text>
                  <TouchableOpacity
                    style={styles.emptyButton}
                    onPress={() => setShowAddModal(true)}
                  >
                    <Text style={styles.emptyButtonText}>Add Measurement</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                measurements.map((measurement) => (
                  <View key={measurement.measurement_id} style={styles.measurementCard}>
                    <View style={styles.cardHeader}>
                      <Text style={styles.cardDate}>{formatDate(measurement.date)}</Text>
                      <TouchableOpacity onPress={() => handleDelete(measurement.date)}>
                        <Ionicons name="trash-outline" size={18} color="#EF4444" />
                      </TouchableOpacity>
                    </View>
                    <View style={styles.measurementGrid}>
                      {MEASUREMENT_FIELDS.filter(f => measurement[f.key as keyof Measurement]).map((field) => (
                        <View key={field.key} style={styles.measurementItem}>
                          <Text style={styles.measurementLabel}>{field.label}</Text>
                          <Text style={styles.measurementValue}>
                            {measurement[field.key as keyof Measurement]} {field.unit}
                          </Text>
                        </View>
                      ))}
                    </View>
                    {measurement.notes && (
                      <Text style={styles.notes}>{measurement.notes}</Text>
                    )}
                  </View>
                ))
              )}
            </>
          ) : (
            <>
              {Object.keys(progress).length === 0 ? (
                <View style={styles.emptyState}>
                  <Ionicons name="analytics-outline" size={64} color="#374151" />
                  <Text style={styles.emptyTitle}>Not enough data</Text>
                  <Text style={styles.emptySubtitle}>
                    Add more measurements to see your progress over time
                  </Text>
                </View>
              ) : (
                <View style={styles.progressGrid}>
                  {MEASUREMENT_FIELDS.filter(f => progress[f.key]).map((field) => {
                    const data = progress[field.key];
                    const changeColor = isDecreaseGood(field.key) 
                      ? getChangeColor(data.change) 
                      : getGainColor(data.change);
                    
                    return (
                      <View key={field.key} style={styles.progressCard}>
                        <View style={styles.progressHeader}>
                          <Ionicons name={field.icon as any} size={20} color="#10B981" />
                          <Text style={styles.progressLabel}>{field.label}</Text>
                        </View>
                        <View style={styles.progressValues}>
                          <View style={styles.progressValue}>
                            <Text style={styles.progressNumber}>{data.latest}</Text>
                            <Text style={styles.progressUnit}>{field.unit}</Text>
                          </View>
                          <View style={[styles.changeIndicator, { backgroundColor: changeColor + '20' }]}>
                            <Ionicons
                              name={data.change > 0 ? 'arrow-up' : data.change < 0 ? 'arrow-down' : 'remove'}
                              size={14}
                              color={changeColor}
                            />
                            <Text style={[styles.changeText, { color: changeColor }]}>
                              {Math.abs(data.change)} ({Math.abs(data.change_percent)}%)
                            </Text>
                          </View>
                        </View>
                        <Text style={styles.progressRange}>
                          Started at {data.first} {field.unit}
                        </Text>
                      </View>
                    );
                  })}
                </View>
              )}
            </>
          )}
        </ScrollView>
      )}

      {/* Add Measurement Modal */}
      <Modal visible={showAddModal} animationType="slide" transparent>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}
        >
          <View style={styles.modalContent}>
            <View style={styles.modalHandle} />
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Add Measurement</Text>
              <TouchableOpacity onPress={() => setShowAddModal(false)}>
                <Ionicons name="close" size={24} color="#9CA3AF" />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalScroll}>
              <Text style={styles.modalSubtitle}>Enter your measurements (leave blank to skip)</Text>
              
              {MEASUREMENT_FIELDS.map((field) => (
                <View key={field.key} style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>{field.label} ({field.unit})</Text>
                  <TextInput
                    style={styles.input}
                    value={newMeasurement[field.key] || ''}
                    onChangeText={(v) => setNewMeasurement({ ...newMeasurement, [field.key]: v })}
                    keyboardType="decimal-pad"
                    placeholder={`Enter ${field.label.toLowerCase()}`}
                    placeholderTextColor="#6B7280"
                  />
                </View>
              ))}

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Notes (optional)</Text>
                <TextInput
                  style={[styles.input, styles.notesInput]}
                  value={newMeasurement.notes || ''}
                  onChangeText={(v) => setNewMeasurement({ ...newMeasurement, notes: v })}
                  placeholder="Any notes..."
                  placeholderTextColor="#6B7280"
                  multiline
                />
              </View>
            </ScrollView>

            <TouchableOpacity
              style={[styles.saveButton, isSaving && styles.saveButtonDisabled]}
              onPress={handleSave}
              disabled={isSaving}
            >
              <Text style={styles.saveButtonText}>
                {isSaving ? 'Saving...' : 'Save Measurement'}
              </Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
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
  headerText: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  headerSubtitle: {
    fontSize: 14,
    color: '#6B7280',
    marginTop: 2,
  },
  addButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#10B981',
    justifyContent: 'center',
    alignItems: 'center',
  },
  tabSelector: {
    flexDirection: 'row',
    marginHorizontal: 20,
    marginVertical: 12,
    backgroundColor: '#1F2937',
    borderRadius: 12,
    padding: 4,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 8,
    gap: 6,
  },
  activeTab: {
    backgroundColor: '#10B981',
  },
  tabText: {
    color: '#6B7280',
    fontSize: 14,
    fontWeight: '600',
  },
  activeTabText: {
    color: '#FFFFFF',
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
  emptyState: {
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyTitle: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '700',
    marginTop: 16,
  },
  emptySubtitle: {
    color: '#6B7280',
    fontSize: 14,
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 22,
    paddingHorizontal: 20,
  },
  emptyButton: {
    backgroundColor: '#10B981',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
    marginTop: 24,
  },
  emptyButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  measurementCard: {
    backgroundColor: '#1F2937',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  cardDate: {
    color: '#10B981',
    fontSize: 14,
    fontWeight: '600',
  },
  measurementGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  measurementItem: {
    width: '30%',
    backgroundColor: '#111827',
    borderRadius: 8,
    padding: 10,
  },
  measurementLabel: {
    color: '#6B7280',
    fontSize: 11,
    marginBottom: 4,
  },
  measurementValue: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  notes: {
    color: '#9CA3AF',
    fontSize: 13,
    marginTop: 12,
    fontStyle: 'italic',
  },
  progressGrid: {
    gap: 12,
  },
  progressCard: {
    backgroundColor: '#1F2937',
    borderRadius: 16,
    padding: 16,
  },
  progressHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  progressLabel: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  progressValues: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  progressValue: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 4,
  },
  progressNumber: {
    color: '#FFFFFF',
    fontSize: 32,
    fontWeight: '800',
  },
  progressUnit: {
    color: '#6B7280',
    fontSize: 14,
  },
  changeIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    gap: 4,
  },
  changeText: {
    fontSize: 13,
    fontWeight: '600',
  },
  progressRange: {
    color: '#6B7280',
    fontSize: 12,
    marginTop: 8,
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
    marginBottom: 12,
  },
  modalTitle: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '800',
  },
  modalSubtitle: {
    color: '#9CA3AF',
    fontSize: 14,
    marginBottom: 16,
  },
  modalScroll: {
    maxHeight: 400,
  },
  inputGroup: {
    marginBottom: 12,
  },
  inputLabel: {
    color: '#9CA3AF',
    fontSize: 13,
    marginBottom: 6,
  },
  input: {
    backgroundColor: '#111827',
    borderRadius: 10,
    padding: 14,
    color: '#FFFFFF',
    fontSize: 16,
  },
  notesInput: {
    height: 80,
    textAlignVertical: 'top',
  },
  saveButton: {
    backgroundColor: '#10B981',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 16,
  },
  saveButtonDisabled: {
    opacity: 0.7,
  },
  saveButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
});
