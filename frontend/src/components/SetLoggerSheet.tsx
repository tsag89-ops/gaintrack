import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Modal,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { WorkoutSet } from '../types';

interface SetLoggerSheetProps {
  visible: boolean;
  exerciseName: string;
  sets: WorkoutSet[];
  onClose: () => void;
  onSave: (sets: WorkoutSet[]) => void;
  onRequestWarmup?: (workingWeight: number) => void;
}

export const SetLoggerSheet: React.FC<SetLoggerSheetProps> = ({
  visible,
  exerciseName,
  sets,
  onClose,
  onSave,
  onRequestWarmup,
}) => {
  const [localSets, setLocalSets] = useState<WorkoutSet[]>(sets);
  const [rpe, setRpe] = useState(7);

  React.useEffect(() => {
    setLocalSets(sets.length > 0 ? sets : [{ set_number: 1, weight: 0, reps: 0, rpe: 7, is_warmup: false }]);
  }, [sets, visible]);

  const addSet = () => {
    const lastSet = localSets[localSets.length - 1];
    setLocalSets([
      ...localSets,
      {
        set_number: localSets.length + 1,
        weight: lastSet?.weight || 0,
        reps: lastSet?.reps || 0,
        rpe: 7,
        is_warmup: false,
      },
    ]);
  };

  const updateSet = (index: number, field: keyof WorkoutSet, value: any) => {
    const updated = [...localSets];
    updated[index] = { ...updated[index], [field]: value };
    setLocalSets(updated);
  };

  const removeSet = (index: number) => {
    if (localSets.length > 1) {
      const updated = localSets.filter((_, i) => i !== index);
      setLocalSets(updated.map((s, i) => ({ ...s, set_number: i + 1 })));
    }
  };

  const handleSave = () => {
    onSave(localSets.map(s => ({ ...s, rpe })));
    onClose();
  };

  const getWarmupSets = () => {
    const workingWeight = localSets.find(s => !s.is_warmup)?.weight || 0;
    if (workingWeight > 0 && onRequestWarmup) {
      onRequestWarmup(workingWeight);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <View style={styles.handle} />
          
          <View style={styles.header}>
            <Text style={styles.title}>{exerciseName}</Text>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={24} color="#9CA3AF" />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.content}>
            <View style={styles.setsHeader}>
              <Text style={[styles.headerLabel, { flex: 0.5 }]}>Set</Text>
              <Text style={[styles.headerLabel, { flex: 1 }]}>Weight</Text>
              <Text style={[styles.headerLabel, { flex: 1 }]}>Reps</Text>
              <View style={{ width: 40 }} />
            </View>

            {localSets.map((set, index) => (
              <View key={index} style={[styles.setRow, set.is_warmup && styles.warmupRow]}>
                <View style={[styles.setNumber, { flex: 0.5 }]}>
                  <Text style={styles.setNumberText}>
                    {set.is_warmup ? 'W' : set.set_number}
                  </Text>
                </View>
                <View style={[styles.inputContainer, { flex: 1 }]}>
                  <TextInput
                    style={styles.input}
                    value={set.weight.toString()}
                    onChangeText={(v) => updateSet(index, 'weight', parseFloat(v) || 0)}
                    keyboardType="numeric"
                    placeholder="0"
                    placeholderTextColor="#6B7280"
                  />
                  <Text style={styles.unit}>lbs</Text>
                </View>
                <View style={[styles.inputContainer, { flex: 1 }]}>
                  <TextInput
                    style={styles.input}
                    value={set.reps.toString()}
                    onChangeText={(v) => updateSet(index, 'reps', parseInt(v) || 0)}
                    keyboardType="numeric"
                    placeholder="0"
                    placeholderTextColor="#6B7280"
                  />
                </View>
                <TouchableOpacity
                  style={styles.removeBtn}
                  onPress={() => removeSet(index)}
                >
                  <Ionicons name="trash-outline" size={18} color="#EF4444" />
                </TouchableOpacity>
              </View>
            ))}

            <View style={styles.rpeContainer}>
              <Text style={styles.rpeLabel}>RPE (Rate of Perceived Exertion)</Text>
              <View style={styles.rpeSlider}>
                {[5, 6, 7, 8, 9, 10].map((value) => (
                  <TouchableOpacity
                    key={value}
                    style={[
                      styles.rpeButton,
                      rpe === value && styles.rpeButtonActive,
                    ]}
                    onPress={() => setRpe(value)}
                  >
                    <Text
                      style={[
                        styles.rpeText,
                        rpe === value && styles.rpeTextActive,
                      ]}
                    >
                      {value}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          </ScrollView>

          <View style={styles.actions}>
            <TouchableOpacity style={styles.addSetBtn} onPress={addSet}>
              <Ionicons name="add" size={20} color="#10B981" />
              <Text style={styles.addSetText}>Add Set</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.warmupBtn} onPress={getWarmupSets}>
              <Ionicons name="flame-outline" size={20} color="#F59E0B" />
              <Text style={styles.warmupText}>Warmup</Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity style={styles.saveBtn} onPress={handleSave}>
            <Text style={styles.saveBtnText}>Save Sets</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#1F2937',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingBottom: 34,
    maxHeight: '80%',
  },
  handle: {
    width: 40,
    height: 4,
    backgroundColor: '#4B5563',
    borderRadius: 2,
    alignSelf: 'center',
    marginTop: 12,
    marginBottom: 20,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '700',
  },
  content: {
    maxHeight: 300,
  },
  setsHeader: {
    flexDirection: 'row',
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#374151',
    marginBottom: 8,
  },
  headerLabel: {
    color: '#6B7280',
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  setRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#374151',
  },
  warmupRow: {
    backgroundColor: '#F59E0B10',
  },
  setNumber: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#374151',
    justifyContent: 'center',
    alignItems: 'center',
  },
  setNumberText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#111827',
    borderRadius: 8,
    marginHorizontal: 4,
    paddingHorizontal: 8,
  },
  input: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
    paddingVertical: 8,
    textAlign: 'center',
  },
  unit: {
    color: '#6B7280',
    fontSize: 12,
  },
  removeBtn: {
    width: 40,
    alignItems: 'center',
  },
  rpeContainer: {
    marginTop: 20,
  },
  rpeLabel: {
    color: '#9CA3AF',
    fontSize: 14,
    marginBottom: 12,
  },
  rpeSlider: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  rpeButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#374151',
    justifyContent: 'center',
    alignItems: 'center',
  },
  rpeButtonActive: {
    backgroundColor: '#10B981',
  },
  rpeText: {
    color: '#9CA3AF',
    fontSize: 16,
    fontWeight: '600',
  },
  rpeTextActive: {
    color: '#FFFFFF',
  },
  actions: {
    flexDirection: 'row',
    marginTop: 20,
    gap: 12,
  },
  addSetBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#10B98120',
    paddingVertical: 12,
    borderRadius: 12,
    gap: 6,
  },
  addSetText: {
    color: '#10B981',
    fontSize: 14,
    fontWeight: '600',
  },
  warmupBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F59E0B20',
    paddingVertical: 12,
    borderRadius: 12,
    gap: 6,
  },
  warmupText: {
    color: '#F59E0B',
    fontSize: 14,
    fontWeight: '600',
  },
  saveBtn: {
    backgroundColor: '#10B981',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 16,
  },
  saveBtnText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
});
