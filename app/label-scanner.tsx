import { useCallback, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { router } from 'expo-router';
import {
  Camera,
  useCameraDevice,
  useCameraPermission,
  useFrameProcessor,
} from 'react-native-vision-camera';
import { useRunOnJS, useSharedValue } from 'react-native-worklets-core';
import { scanOCR } from 'vision-camera-ocr';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';
import { colors, spacing, borderRadius } from '../lib/theme';
import { setPendingLabel } from '../lib/labelState';
import type { FoodResult } from '../types/food';

// ─── Constants ────────────────────────────────────────────────────────────────

const NUTRITION_KEYWORDS = ['calories', 'protein', 'total fat', 'serving size'];
const FRAMES_REQUIRED    = 3;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getLocalDateString(): string {
  return new Date().toLocaleDateString('en-CA');
}

async function incrementScanCount(): Promise<void> {
  const key = `label_scans_${getLocalDateString()}`;
  const val  = await AsyncStorage.getItem(key);
  await AsyncStorage.setItem(key, String((val ? parseInt(val) : 0) + 1));
}

function buildFoodResult(data: {
  calories: number | null;
  protein: number | null;
  carbs: number | null;
  fat: number | null;
  servingG: number | null;
  servingSize: string | null;
}): FoodResult {
  const servingG = data.servingG && data.servingG > 0 ? data.servingG : 100;
  const factor   = 100 / servingG;

  return {
    id:                `label-${Date.now()}`,
    name:              'Scanned Item',
    calories100g:      Math.round((data.calories ?? 0) * factor),
    protein100g:       Math.round((data.protein ?? 0) * factor * 10) / 10,
    carbs100g:         Math.round((data.carbs ?? 0) * factor * 10) / 10,
    fat100g:           Math.round((data.fat ?? 0) * factor * 10) / 10,
    servingG,
    householdServing:  data.servingSize ?? '1 serving',
    source:            'label',
    fatsecretFoodId:   null,
    fatsecretServingId: null,
  };
}

// ─── LabelScannerScreen ───────────────────────────────────────────────────────

export default function LabelScannerScreen() {
  const device = useCameraDevice('back');
  const { hasPermission, requestPermission } = useCameraPermission();

  const [status, setStatus] = useState<'scanning' | 'loading' | 'error'>('scanning');
  const [errorMsg, setErrorMsg] = useState('');

  // Shared values live in the VisionCamera worklet context
  const consecutiveCount = useSharedValue(0);
  const isLocked         = useSharedValue(false);

  // ── Stable text handling (JS thread) ──────────────────────────────────────
  const handleStableText = useCallback(async (text: string) => {
    setStatus('loading');
    try {
      const { data, error } = await supabase.functions.invoke('food-vision', {
        body: { ocrText: text },
      });
      if (error) throw error;
      if (data?.error) throw new Error('parse_failed');

      const result = buildFoodResult(data);
      await incrementScanCount();
      setPendingLabel(result);
      router.back();
    } catch {
      setErrorMsg("Couldn't read label — try better lighting");
      setStatus('error');
    }
  }, []);

  // useRunOnJS wraps handleStableText so it can be called from the worklet
  const onNutritionDetected = useRunOnJS(handleStableText, [handleStableText]);

  // ── Frame processor ───────────────────────────────────────────────────────
  const frameProcessor = useFrameProcessor((frame) => {
    'worklet';
    if (isLocked.value) return;

    try {
      const { result } = scanOCR(frame);
      const lower = result.text.toLowerCase();

      const hasKeywords =
        lower.includes('calories') &&
        (lower.includes('protein') ||
          lower.includes('total fat') ||
          lower.includes('serving size'));

      if (hasKeywords) {
        consecutiveCount.value += 1;
        if (consecutiveCount.value >= FRAMES_REQUIRED) {
          isLocked.value = true;
          onNutritionDetected(result.text);
        }
      } else {
        consecutiveCount.value = 0;
      }
    } catch {
      // OCR native module not available (simulator / web)
    }
  }, [onNutritionDetected]);

  function retry() {
    consecutiveCount.value = 0;
    isLocked.value         = false;
    setErrorMsg('');
    setStatus('scanning');
  }

  // ── Permission denied ─────────────────────────────────────────────────────
  if (!hasPermission) {
    return (
      <View style={styles.permissionScreen}>
        <Ionicons name="camera-outline" size={56} color={colors.textMuted} />
        <Text style={styles.permissionTitle}>Camera Access Required</Text>
        <Text style={styles.permissionBody}>
          LeanLog needs camera access to scan nutrition labels.
        </Text>
        <Pressable style={styles.permissionBtn} onPress={requestPermission}>
          <Text style={styles.permissionBtnText}>Allow Camera</Text>
        </Pressable>
        <Pressable style={styles.backLink} onPress={() => router.back()}>
          <Text style={styles.backLinkText}>Go Back</Text>
        </Pressable>
      </View>
    );
  }

  // ── No back camera ────────────────────────────────────────────────────────
  if (!device) {
    return (
      <View style={styles.permissionScreen}>
        <Text style={styles.permissionTitle}>No Camera Found</Text>
        <Pressable style={styles.backLink} onPress={() => router.back()}>
          <Text style={styles.backLinkText}>Go Back</Text>
        </Pressable>
      </View>
    );
  }

  // ── Main camera UI ────────────────────────────────────────────────────────
  return (
    <View style={styles.container}>
      {/* Camera */}
      <Camera
        style={StyleSheet.absoluteFill}
        device={device}
        isActive={status === 'scanning'}
        frameProcessor={frameProcessor}
        pixelFormat="yuv"
      />

      {/* Dark vignette — top band */}
      <View style={styles.vignetteTop} />

      {/* Guide box row */}
      <View style={styles.guideRow}>
        {/* Left dark strip */}
        <View style={styles.vignetteLeft} />
        {/* Viewfinder frame */}
        <View style={styles.viewfinder}>
          <View style={[styles.corner, styles.cornerTL]} />
          <View style={[styles.corner, styles.cornerTR]} />
          <View style={[styles.corner, styles.cornerBL]} />
          <View style={[styles.corner, styles.cornerBR]} />
        </View>
        {/* Right dark strip */}
        <View style={styles.vignetteRight} />
      </View>

      {/* Dark vignette — bottom band */}
      <View style={styles.vignetteBottom}>
        <Text style={styles.hintText}>Point at nutrition label</Text>
      </View>

      {/* Back button */}
      <Pressable style={styles.backBtn} onPress={() => router.back()}>
        <Ionicons name="arrow-back" size={24} color="#fff" />
      </Pressable>

      {/* Loading overlay */}
      {status === 'loading' && (
        <View style={styles.overlay}>
          <ActivityIndicator color={colors.primary} size="large" />
          <Text style={styles.overlayText}>Reading label...</Text>
        </View>
      )}

      {/* Error card */}
      {status === 'error' && (
        <View style={styles.errorCard}>
          <Ionicons name="warning-outline" size={32} color="#f87171" />
          <Text style={styles.errorText}>{errorMsg}</Text>
          <Pressable style={styles.retryBtn} onPress={retry}>
            <Text style={styles.retryBtnText}>Scan Again</Text>
          </Pressable>
          <Pressable
            style={styles.manualBtn}
            onPress={() => {
              router.back();
            }}
          >
            <Text style={styles.manualBtnText}>Search Manually</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const CORNER_SIZE = 20;
const CORNER_THICK = 3;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },

  // Permission / error full-screens
  permissionScreen: {
    flex: 1,
    backgroundColor: colors.background,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    gap: spacing.md,
  },
  permissionTitle: {
    fontSize: 22,
    fontFamily: 'Inter_700Bold',
    color: colors.text,
    textAlign: 'center',
  },
  permissionBody: {
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
    color: colors.textMuted,
    textAlign: 'center',
    lineHeight: 22,
  },
  permissionBtn: {
    backgroundColor: colors.primary,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    marginTop: spacing.sm,
  },
  permissionBtnText: {
    fontSize: 16,
    fontFamily: 'Inter_700Bold',
    color: '#000',
  },
  backLink: {
    paddingVertical: spacing.sm,
  },
  backLinkText: {
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
    color: colors.textMuted,
    textDecorationLine: 'underline',
  },

  // Vignette overlay sections
  vignetteTop: {
    height: 120,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  guideRow: {
    flexDirection: 'row',
    height: 220,
  },
  vignetteLeft: {
    width: 24,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  vignetteRight: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  vignetteBottom: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'flex-start',
    alignItems: 'center',
    paddingTop: spacing.lg,
  },

  // Viewfinder
  viewfinder: {
    width: 280,
    height: 220,
    position: 'relative',
  },
  corner: {
    position: 'absolute',
    width: CORNER_SIZE,
    height: CORNER_SIZE,
    borderColor: '#22c55e',
  },
  cornerTL: {
    top: 0,
    left: 0,
    borderTopWidth: CORNER_THICK,
    borderLeftWidth: CORNER_THICK,
  },
  cornerTR: {
    top: 0,
    right: 0,
    borderTopWidth: CORNER_THICK,
    borderRightWidth: CORNER_THICK,
  },
  cornerBL: {
    bottom: 0,
    left: 0,
    borderBottomWidth: CORNER_THICK,
    borderLeftWidth: CORNER_THICK,
  },
  cornerBR: {
    bottom: 0,
    right: 0,
    borderBottomWidth: CORNER_THICK,
    borderRightWidth: CORNER_THICK,
  },
  hintText: {
    fontSize: 15,
    fontFamily: 'Inter_400Regular',
    color: 'rgba(255,255,255,0.85)',
    textAlign: 'center',
  },

  // Back button
  backBtn: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 56 : 24,
    left: spacing.lg,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },

  // Loading overlay
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.md,
  },
  overlayText: {
    fontSize: 16,
    fontFamily: 'Inter_600SemiBold',
    color: '#fff',
  },

  // Error card
  errorCard: {
    position: 'absolute',
    bottom: 80,
    left: spacing.lg,
    right: spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.xl,
    alignItems: 'center',
    gap: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  errorText: {
    fontSize: 15,
    fontFamily: 'Inter_400Regular',
    color: colors.text,
    textAlign: 'center',
  },
  retryBtn: {
    backgroundColor: colors.primary,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.xl,
    width: '100%',
    alignItems: 'center',
  },
  retryBtnText: {
    fontSize: 15,
    fontFamily: 'Inter_700Bold',
    color: '#000',
  },
  manualBtn: {
    paddingVertical: spacing.sm,
    width: '100%',
    alignItems: 'center',
  },
  manualBtnText: {
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
    color: colors.textMuted,
    textDecorationLine: 'underline',
  },
});
