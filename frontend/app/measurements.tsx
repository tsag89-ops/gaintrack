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
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { measurementsApi } from '../src/services/api';
import { format } from 'date-fns';
import { LineChart } from 'react-native-chart-kit';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { BodyCompositionGoals } from '../src/types/bodyGoals';
import { useLanguage } from '../src/context/LanguageContext';

const SCREEN_W = Dimensions.get('window').width;
const NUTRITION_KEY = 'gaintrack_nutrition';
const BODY_GOALS_KEY = 'gaintrack_body_goals';
const CHART_CFG = {
  backgroundColor: '#252525',
  backgroundGradientFrom: '#252525',
  backgroundGradientTo: '#252525',
  decimalPlaces: 1,
  color: (opacity = 1) => `rgba(255, 98, 0, ${opacity})`,
  labelColor: (opacity = 1) => `rgba(176, 176, 176, ${opacity})`,
  propsForDots: { r: '4', strokeWidth: '2', stroke: '#FF6200' },
  propsForBackgroundLines: { stroke: '#303030', strokeDasharray: '' },
};

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
  const { t } = useLanguage();
  const [measurements, setMeasurements] = useState<Measurement[]>([]);
  const [progress, setProgress] = useState<Record<string, MeasurementProgress>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [newMeasurement, setNewMeasurement] = useState<Record<string, string>>({});
  const [activeTab, setActiveTab] = useState<'history' | 'progress'>('history');
  const [nutritionDays, setNutritionDays] = useState<any[]>([]);
  const [bodyGoals, setBodyGoals] = useState<BodyCompositionGoals | null>(null);

  const fetchData = useCallback(async () => {
    try {
      setIsLoading(true);
      const [measurementsData, progressData, nRaw, gRaw] = await Promise.all([
        measurementsApi.getAll(30),
        measurementsApi.getProgress(90),
        AsyncStorage.getItem(NUTRITION_KEY),
        AsyncStorage.getItem(BODY_GOALS_KEY),
      ]);
      setMeasurements(measurementsData);
      setProgress((progressData as any)?.changes || {});
      setNutritionDays(nRaw ? JSON.parse(nRaw) : []);
      setBodyGoals(gRaw ? JSON.parse(gRaw) : null);
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
      Alert.alert(t('common.error'), t('measurements.enterAtLeastOne'));
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
      Alert.alert(t('common.success'), t('measurements.saved'));
    } catch (error) {
      console.error('Error saving measurement:', error);
      Alert.alert(t('common.error'), t('measurements.saveFailed'));
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (date: string) => {
    Alert.alert(t('measurements.deleteTitle'), t('measurements.deleteMessage'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('measurements.deleteAction'),
        style: 'destructive',
        onPress: async () => {
          try {
            await measurementsApi.delete(date);
            await fetchData();
          } catch (error) {
            console.error('Error deleting measurement:', error);
            Alert.alert(t('common.error'), t('measurements.deleteFailed'));
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
    return change < 0 ? '#4CAF50' : change > 0 ? '#F44336' : '#B0B0B0';
  };

  const getGainColor = (change: number) => {
    // For measurements where increase is good (biceps, chest, etc)
    return change > 0 ? '#4CAF50' : change < 0 ? '#F44336' : '#B0B0B0';
  };

  const isDecreaseGood = (key: string) => {
    return ['weight', 'waist', 'body_fat', 'hips'].includes(key);
  };

  // ── Chart data ──────────────────────────────────────────────────────────────

  // Weight trend: last 20 entries with weight, ascending order for display
  const weightEntries = [...measurements]
    .filter(m => typeof m.weight === 'number' && (m.weight as number) > 0)
    .reverse()
    .slice(-20);
  const weightChartData = {
    labels: weightEntries.map(m => format(new Date(m.date), 'M/d')),
    data: weightEntries.map(m => m.weight as number),
  };

  // Calorie trend: last 14 days with logged nutrition
  const calDayMap: Record<string, number> = {};
  nutritionDays.forEach((n: any) => { if (n?.date) calDayMap[n.date] = n.total_calories ?? 0; });
  const calEntries = Object.entries(calDayMap)
    .filter(([, v]) => v > 0)
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-14);
  const calChartData = {
    labels: calEntries.map(([d]) => d.slice(5, 7) + '/' + d.slice(8, 10)),
    data: calEntries.map(([, v]) => Math.round(v)),
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="chevron-back" size={28} color="#FFFFFF" />
        </TouchableOpacity>
        <View style={styles.headerText}>
          <Text style={styles.headerTitle}>{t('measurements.title')}</Text>
          <Text style={styles.headerSubtitle}>{t('measurements.subtitle')}</Text>
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
            color={activeTab === 'history' ? '#FFFFFF' : '#B0B0B0'}
          />
          <Text style={[styles.tabText, activeTab === 'history' && styles.activeTabText]}>
            {t('measurements.historyTab')}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'progress' && styles.activeTab]}
          onPress={() => setActiveTab('progress')}
        >
          <Ionicons
            name="analytics-outline"
            size={18}
            color={activeTab === 'progress' ? '#FFFFFF' : '#B0B0B0'}
          />
          <Text style={[styles.tabText, activeTab === 'progress' && styles.activeTabText]}>
            {t('measurements.progressTab')}
          </Text>
        </TouchableOpacity>
      </View>

      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#4CAF50" />
        </View>
      ) : (
        <ScrollView
          style={styles.content}
          contentContainerStyle={styles.scrollContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#4CAF50" />
          }
        >
          {activeTab === 'history' ? (
            <>
              {measurements.length === 0 ? (
                <View style={styles.emptyState}>
                  <Ionicons name="body-outline" size={64} color="#303030" />
                  <Text style={styles.emptyTitle}>{t('measurements.noMeasurementsTitle')}</Text>
                  <Text style={styles.emptySubtitle}>
                    {t('measurements.noMeasurementsSubtitle')}
                  </Text>
                  <TouchableOpacity
                    style={styles.emptyButton}
                    onPress={() => setShowAddModal(true)}
                  >
                    <Text style={styles.emptyButtonText}>{t('measurements.addMeasurement')}</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                measurements.map((measurement) => (
                  <View key={measurement.measurement_id} style={styles.measurementCard}>
                    <View style={styles.cardHeader}>
                      <Text style={styles.cardDate}>{formatDate(measurement.date)}</Text>
                      <TouchableOpacity onPress={() => handleDelete(measurement.date)}>
                        <Ionicons name="trash-outline" size={18} color="#F44336" />
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
              {/* Weight Trend Chart */}
              {weightChartData.data.length > 1 && (
                <View style={styles.chartCard}>
                  <View style={styles.chartHeaderRow}>
                    <View>
                      <Text style={styles.chartTitle}>{t('progressTab.weightTrendTitle')}</Text>
                      <Text style={styles.chartSubtitle}>{t('measurements.lastEntries', { count: weightChartData.data.length })}</Text>
                    </View>
                    <TouchableOpacity
                      style={styles.setGoalBtn}
                      onPress={() => router.push('/body-goals' as any)}
                    >
                      <Ionicons name="flag-outline" size={14} color="#FF6200" />
                      <Text style={styles.setGoalBtnText}>{t('measurements.setGoal')}</Text>
                    </TouchableOpacity>
                  </View>
                  <LineChart
                    data={{
                      labels: weightChartData.labels,
                      datasets: [
                        { data: weightChartData.data, strokeWidth: 2 },
                        ...(bodyGoals?.targetWeight && weightChartData.data.length > 0
                          ? [{
                              data: Array(weightChartData.data.length).fill(bodyGoals.targetWeight) as number[],
                              strokeWidth: 1.5,
                              color: (opacity = 1) => `rgba(255, 98, 0, ${opacity * 0.75})`,
                              withDots: false,
                            }]
                          : []),
                      ],
                    }}
                    width={SCREEN_W - 40}
                    height={200}
                    chartConfig={CHART_CFG}
                    bezier
                    withShadow={false}
                    style={{ borderRadius: 12 }}
                    yAxisSuffix=" lbs"
                    formatYLabel={(y) => String(Math.round(Number(y)))}
                  />
                  {bodyGoals?.targetWeight && (
                    <View style={styles.goalLineLabel}>
                      <View style={styles.goalLineDash} />
                      <Text style={styles.goalLineLabelText}>
                        {t('measurements.goalWithWeight', { weight: bodyGoals.targetWeight })}
                        {bodyGoals.targetDate
                          ? `  ·  ${t('measurements.byDate', { date: format(new Date(bodyGoals.targetDate), 'MMM yyyy') })}`
                          : ''}
                      </Text>
                    </View>
                  )}
                  <View style={styles.chartStats}>
                    <View style={styles.chartStatBox}>
                      <Text style={styles.chartStatValue}>{weightChartData.data[weightChartData.data.length - 1]} lbs</Text>
                      <Text style={styles.chartStatLabel}>{t('measurements.current')}</Text>
                    </View>
                    <View style={styles.chartStatBox}>
                      <Text style={styles.chartStatValue}>{Math.min(...weightChartData.data)} lbs</Text>
                      <Text style={styles.chartStatLabel}>{t('measurements.lowest')}</Text>
                    </View>
                    <View style={styles.chartStatBox}>
                      <Text style={[
                        styles.chartStatValue,
                        { color: weightChartData.data[weightChartData.data.length - 1] <= weightChartData.data[0] ? '#4CAF50' : '#F44336' },
                      ]}>
                        {(weightChartData.data[weightChartData.data.length - 1] >= weightChartData.data[0] ? '+' : '') +
                          (Math.round((weightChartData.data[weightChartData.data.length - 1] - weightChartData.data[0]) * 10) / 10)} lbs
                      </Text>
                      <Text style={styles.chartStatLabel}>{t('measurements.change')}</Text>
                    </View>
                  </View>
                </View>
              )}

              {/* Daily Calorie Intake alongside weight trends */}
              {calChartData.data.length > 1 && (
                <View style={styles.chartCard}>
                  <Text style={styles.chartTitle}>{t('measurements.dailyCalorieIntake')}</Text>
                  <Text style={styles.chartSubtitle}>{t('measurements.dailyCalorieSubtitle', { count: calChartData.data.length })}</Text>
                  <LineChart
                    data={{
                      labels: calChartData.labels,
                      datasets: [{ data: calChartData.data, strokeWidth: 2, color: (o = 1) => `rgba(59,130,246,${o})` }],
                    }}
                    width={SCREEN_W - 40}
                    height={180}
                    chartConfig={{ ...CHART_CFG, color: (o = 1) => `rgba(59,130,246,${o})`, propsForDots: { r: '3', strokeWidth: '2', stroke: '#3B82F6' } }}
                    bezier
                    withShadow={false}
                    style={{ borderRadius: 12 }}
                    yAxisSuffix=" kcal"
                    formatYLabel={(y) => String(Math.round(Number(y) / 100) * 100)}
                  />
                </View>
              )}

              {/* Measurement Progress Stats */}
              {Object.keys(progress).length === 0 ? (
                weightChartData.data.length < 2 ? (
                  <View style={styles.emptyState}>
                    <Ionicons name="analytics-outline" size={64} color="#303030" />
                    <Text style={styles.emptyTitle}>{t('measurements.notEnoughData')}</Text>
                    <Text style={styles.emptySubtitle}>
                      {t('measurements.notEnoughDataSubtitle')}
                    </Text>
                  </View>
                ) : null
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
                          <Ionicons name={field.icon as any} size={20} color="#FF6200" />
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
                          {t('measurements.startedAt', { value: data.first, unit: field.unit })}
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
              <Text style={styles.modalTitle}>{t('measurements.addMeasurement')}</Text>
              <TouchableOpacity onPress={() => setShowAddModal(false)}>
                <Ionicons name="close" size={24} color="#B0B0B0" />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalScroll}>
              <Text style={styles.modalSubtitle}>{t('measurements.modalSubtitle')}</Text>
              
              {MEASUREMENT_FIELDS.map((field) => (
                <View key={field.key} style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>{field.label} ({field.unit})</Text>
                  <TextInput
                    style={styles.input}
                    value={newMeasurement[field.key] || ''}
                    onChangeText={(v) => setNewMeasurement({ ...newMeasurement, [field.key]: v })}
                    keyboardType="decimal-pad"
                    placeholder={t('measurements.enterField', { field: field.label.toLowerCase() })}
                    placeholderTextColor="#B0B0B0"
                  />
                </View>
              ))}

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>{t('measurements.notesOptional')}</Text>
                <TextInput
                  style={[styles.input, styles.notesInput]}
                  value={newMeasurement.notes || ''}
                  onChangeText={(v) => setNewMeasurement({ ...newMeasurement, notes: v })}
                  placeholder={t('measurements.notesPlaceholder')}
                  placeholderTextColor="#B0B0B0"
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
                {isSaving ? t('common.saving') : t('measurements.saveMeasurement')}
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
    backgroundColor: '#1A1A1A',
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
    color: '#B0B0B0',
    marginTop: 2,
  },
  addButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#FF6200',
    justifyContent: 'center',
    alignItems: 'center',
  },
  tabSelector: {
    flexDirection: 'row',
    marginHorizontal: 20,
    marginVertical: 12,
    backgroundColor: '#252525',
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
    backgroundColor: '#FF6200',
  },
  tabText: {
    color: '#B0B0B0',
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
    color: '#B0B0B0',
    fontSize: 14,
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 22,
    paddingHorizontal: 20,
  },
  emptyButton: {
    backgroundColor: '#FF6200',
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
    backgroundColor: '#252525',
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
    color: '#FF6200',
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
    backgroundColor: '#1A1A1A',
    borderRadius: 8,
    padding: 10,
  },
  measurementLabel: {
    color: '#B0B0B0',
    fontSize: 11,
    marginBottom: 4,
  },
  measurementValue: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  notes: {
    color: '#B0B0B0',
    fontSize: 13,
    marginTop: 12,
    fontStyle: 'italic',
  },
  progressGrid: {
    gap: 12,
  },
  progressCard: {
    backgroundColor: '#252525',
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
    color: '#B0B0B0',
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
    color: '#B0B0B0',
    fontSize: 12,
    marginTop: 8,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#252525',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    paddingBottom: 34,
    maxHeight: '85%',
  },
  modalHandle: {
    width: 40,
    height: 4,
    backgroundColor: '#2D2D2D',
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
    color: '#B0B0B0',
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
    color: '#B0B0B0',
    fontSize: 13,
    marginBottom: 6,
  },
  input: {
    backgroundColor: '#1A1A1A',
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
    backgroundColor: '#FF6200',
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
  chartCard: {
    backgroundColor: '#252525',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    overflow: 'hidden',
  },
  chartHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 0,
  },
  setGoalBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1.5,
    borderColor: '#FF6200',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  setGoalBtnText: {
    color: '#FF6200',
    fontSize: 12,
    fontWeight: '600',
  },
  goalLineLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#303030',
  },
  goalLineDash: {
    width: 20,
    height: 2,
    backgroundColor: '#FF6200',
    opacity: 0.75,
    borderRadius: 1,
  },
  goalLineLabelText: {
    color: '#FF6200',
    fontSize: 12,
    fontWeight: '600',
  },
  chartTitle: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '700',
    marginBottom: 2,
  },
  chartSubtitle: {
    color: '#B0B0B0',
    fontSize: 13,
    marginBottom: 12,
  },
  chartStats: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#303030',
  },
  chartStatBox: {
    alignItems: 'center',
  },
  chartStatValue: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  chartStatLabel: {
    color: '#B0B0B0',
    fontSize: 12,
    marginTop: 2,
  },
});
