import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { CameraView, useCameraPermissions, BarcodeScanningResult } from 'expo-camera';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { getFoodByBarcode, FoodItem } from '../services/foodSearch';

interface BarcodeScannerProps {
  onFoodFound: (food: FoodItem) => void;
  onNotFound: (barcode: string) => void;
  onClose: () => void;
}

export default function BarcodeScanner({ onFoodFound, onNotFound, onClose }: BarcodeScannerProps) {
  const [permission, requestPermission] = useCameraPermissions();
  const [torch, setTorch] = useState(false);
  const [scanning, setScanning] = useState(false);
  const lastScanned = useRef<string | null>(null);

  useEffect(() => {
    if (!permission?.granted) {
      requestPermission();
    }
  }, [permission?.granted]);

  const handleBarCodeScanned = async ({ data }: BarcodeScanningResult) => {
    if (scanning || data === lastScanned.current) return;
    lastScanned.current = data;
    setScanning(true);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    try {
      const food = await getFoodByBarcode(data);
      if (food) {
        onFoodFound(food);
      } else {
        Alert.alert(
          'Product not found',
          'Add it manually?',
          [
            { text: 'Cancel', style: 'cancel', onPress: () => { lastScanned.current = null; setScanning(false); } },
            { text: 'Add Manually', onPress: () => onNotFound(data) },
          ],
        );
      }
    } catch {
      Alert.alert('Error', 'Failed to look up barcode. Try again.');
      lastScanned.current = null;
      setScanning(false);
    }
  };

  if (!permission) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#FF6200" size="large" />
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={styles.center}>
        <Text style={styles.permissionText}>Camera permission is required to scan barcodes.</Text>
        <TouchableOpacity style={styles.permissionBtn} onPress={requestPermission}>
          <Text style={styles.permissionBtnText}>Grant Permission</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <CameraView
        style={StyleSheet.absoluteFill}
        facing="back"
        enableTorch={torch}
        barcodeScannerSettings={{ barcodeTypes: ['ean13', 'ean8', 'upc_a', 'upc_e', 'qr', 'code128', 'code39'] }}
        onBarcodeScanned={scanning ? undefined : handleBarCodeScanned}
      />

      {/* Overlay */}
      <View style={styles.overlay}>
        <View style={styles.topBar}>
          <TouchableOpacity onPress={onClose} style={styles.iconBtn}>
            <Ionicons name="close" size={28} color="#FFFFFF" />
          </TouchableOpacity>
          <Text style={styles.title}>Scan Barcode</Text>
          <TouchableOpacity onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setTorch(t => !t); }} style={styles.iconBtn}>
            <Ionicons name={torch ? 'flash' : 'flash-outline'} size={24} color={torch ? '#FF6200' : '#FFFFFF'} />
          </TouchableOpacity>
        </View>

        <View style={styles.viewfinder}>
          <View style={[styles.corner, styles.topLeft]} />
          <View style={[styles.corner, styles.topRight]} />
          <View style={[styles.corner, styles.bottomLeft]} />
          <View style={[styles.corner, styles.bottomRight]} />
          {scanning && (
            <View style={styles.scanningIndicator}>
              <ActivityIndicator color="#FF6200" size="large" />
              <Text style={styles.scanningText}>Looking up product…</Text>
            </View>
          )}
        </View>

        <Text style={styles.hint}>Point camera at a product barcode</Text>
      </View>
    </View>
  );
}

const CORNER = 28;
const BORDER = 3;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  center: { flex: 1, backgroundColor: '#1A1A1A', justifyContent: 'center', alignItems: 'center', padding: 24 },
  permissionText: { color: '#FFFFFF', fontSize: 15, textAlign: 'center', marginBottom: 20 },
  permissionBtn: { backgroundColor: '#FF6200', paddingHorizontal: 24, paddingVertical: 12, borderRadius: 10 },
  permissionBtnText: { color: '#FFFFFF', fontWeight: '700', fontSize: 15 },

  overlay: { ...StyleSheet.absoluteFillObject, justifyContent: 'space-between', alignItems: 'center', paddingTop: 56, paddingBottom: 60 },

  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', width: '100%', paddingHorizontal: 20 },
  iconBtn: { padding: 6, backgroundColor: 'rgba(0,0,0,0.4)', borderRadius: 20 },
  title: { color: '#FFFFFF', fontSize: 17, fontWeight: '700' },

  viewfinder: {
    width: 260,
    height: 160,
    justifyContent: 'center',
    alignItems: 'center',
  },
  corner: { position: 'absolute', width: CORNER, height: CORNER, borderColor: '#FF6200' },
  topLeft: { top: 0, left: 0, borderTopWidth: BORDER, borderLeftWidth: BORDER },
  topRight: { top: 0, right: 0, borderTopWidth: BORDER, borderRightWidth: BORDER },
  bottomLeft: { bottom: 0, left: 0, borderBottomWidth: BORDER, borderLeftWidth: BORDER },
  bottomRight: { bottom: 0, right: 0, borderBottomWidth: BORDER, borderRightWidth: BORDER },

  scanningIndicator: { alignItems: 'center', gap: 8 },
  scanningText: { color: '#FFFFFF', fontSize: 13, fontWeight: '600' },

  hint: { color: 'rgba(255,255,255,0.7)', fontSize: 13, textAlign: 'center', paddingHorizontal: 40 },
});
