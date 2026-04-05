import { useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { router } from 'expo-router';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Ionicons } from '@expo/vector-icons';
import { lookupBarcode } from '../lib/foodSearch';
import { setPendingBarcode } from '../lib/barcodeState';
import { colors, spacing, borderRadius } from '../lib/theme';

const TOP_INSET = Platform.OS === 'ios' ? 54 : 28;

export default function BarcodeScreen() {
  const [permission, requestPermission] = useCameraPermissions();
  const [loading, setLoading]   = useState(false);
  const [notFound, setNotFound] = useState(false);
  const scannedRef = useRef(false); // ref avoids stale-closure issues vs state

  async function handleBarcodeScanned({ data }: { data: string; type: string }) {
    if (scannedRef.current || loading) return;
    scannedRef.current = true;
    setLoading(true);
    setNotFound(false);

    try {
      const results = await lookupBarcode(data);
      if (results.length > 0) {
        setPendingBarcode(results[0]);
        router.back();
      } else {
        setNotFound(true);
        setLoading(false);
        scannedRef.current = false; // allow re-scan after "not found"
      }
    } catch {
      setNotFound(true);
      setLoading(false);
      scannedRef.current = false;
    }
  }

  function handleRetry() {
    setNotFound(false);
    scannedRef.current = false;
  }

  // ── Loading permissions ────────────────────────────────────────────────────
  if (!permission) {
    return (
      <View style={styles.container}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  // ── Permission denied ─────────────────────────────────────────────────────
  if (!permission.granted) {
    return (
      <View style={styles.permContainer}>
        <Ionicons name="camera-outline" size={64} color={colors.textMuted} />
        <Text style={styles.permTitle}>Camera Access Required</Text>
        <Text style={styles.permSub}>
          Allow camera access to scan barcodes and look up food nutrition.
        </Text>
        <Pressable style={styles.permBtn} onPress={requestPermission}>
          <Text style={styles.permBtnText}>Grant Permission</Text>
        </Pressable>
        <Pressable style={styles.permBack} onPress={() => router.back()}>
          <Text style={styles.permBackText}>Go Back</Text>
        </Pressable>
      </View>
    );
  }

  // ── Camera ────────────────────────────────────────────────────────────────
  return (
    <View style={styles.container}>
      <CameraView
        style={StyleSheet.absoluteFillObject}
        facing="back"
        barcodeScannerSettings={{
          barcodeTypes: ['ean13', 'ean8', 'upc_a', 'upc_e', 'code128'],
        }}
        onBarcodeScanned={scannedRef.current && !notFound ? undefined : handleBarcodeScanned}
      />

      {/* Viewfinder overlay */}
      <View style={styles.overlay}>
        {/* Top dark band */}
        <View style={styles.overlayBand} />

        {/* Middle row: dark | clear window | dark */}
        <View style={styles.overlayMiddle}>
          <View style={styles.overlayBandSide} />
          <View style={styles.viewfinder}>
            {/* Corner brackets */}
            <View style={[styles.corner, styles.cornerTL]} />
            <View style={[styles.corner, styles.cornerTR]} />
            <View style={[styles.corner, styles.cornerBL]} />
            <View style={[styles.corner, styles.cornerBR]} />
          </View>
          <View style={styles.overlayBandSide} />
        </View>

        {/* Bottom dark band */}
        <View style={styles.overlayBand}>
          <Text style={styles.hint}>Point camera at a barcode</Text>
        </View>
      </View>

      {/* Back button */}
      <View style={[styles.topBar, { paddingTop: TOP_INSET }]}>
        <Pressable style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </Pressable>
        <Text style={styles.topBarTitle}>Scan Barcode</Text>
        <View style={{ width: 44 }} />
      </View>

      {/* Loading overlay */}
      {loading && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator color={colors.primary} size="large" />
          <Text style={styles.loadingText}>Looking up product…</Text>
        </View>
      )}

      {/* Not found overlay */}
      {notFound && (
        <View style={styles.notFoundOverlay}>
          <View style={styles.notFoundCard}>
            <Ionicons name="search-outline" size={40} color={colors.textMuted} />
            <Text style={styles.notFoundTitle}>Product Not Found</Text>
            <Text style={styles.notFoundSub}>
              This barcode isn't in our database.
            </Text>
            <Pressable style={styles.scanAgainBtn} onPress={handleRetry}>
              <Text style={styles.scanAgainText}>Scan Again</Text>
            </Pressable>
            <Pressable style={styles.searchManualBtn} onPress={() => router.back()}>
              <Text style={styles.searchManualText}>Search Manually</Text>
            </Pressable>
          </View>
        </View>
      )}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const VIEWFINDER_SIZE = 260;
const CORNER_LEN = 28;
const CORNER_W = 4;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
    justifyContent: 'center',
    alignItems: 'center',
  },

  // ── Permission ──────────────────────────────────────────────────────────────
  permContainer: {
    flex: 1,
    backgroundColor: colors.background,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    gap: spacing.md,
  },
  permTitle: {
    fontSize: 22,
    fontFamily: 'Inter_700Bold',
    color: colors.text,
    textAlign: 'center',
  },
  permSub: {
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
    color: colors.textMuted,
    textAlign: 'center',
    lineHeight: 22,
  },
  permBtn: {
    backgroundColor: colors.primary,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    marginTop: spacing.sm,
  },
  permBtnText: {
    fontSize: 15,
    fontFamily: 'Inter_700Bold',
    color: '#000',
  },
  permBack: {
    paddingVertical: spacing.sm,
  },
  permBackText: {
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
    color: colors.textMuted,
    textDecorationLine: 'underline',
  },

  // ── Top bar ─────────────────────────────────────────────────────────────────
  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
    justifyContent: 'space-between',
  },
  backBtn: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  topBarTitle: {
    fontSize: 17,
    fontFamily: 'Inter_600SemiBold',
    color: '#fff',
  },

  // ── Viewfinder overlay ──────────────────────────────────────────────────────
  overlay: {
    ...StyleSheet.absoluteFillObject,
  },
  overlayBand: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingBottom: spacing.lg,
  },
  overlayMiddle: {
    flexDirection: 'row',
    height: VIEWFINDER_SIZE,
  },
  overlayBandSide: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  viewfinder: {
    width: VIEWFINDER_SIZE,
    height: VIEWFINDER_SIZE,
  },
  hint: {
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
    color: 'rgba(255,255,255,0.8)',
    marginTop: spacing.md,
  },

  // Corner bracket styles
  corner: {
    position: 'absolute',
    borderColor: colors.primary,
  },
  cornerTL: {
    top: 0,
    left: 0,
    width: CORNER_LEN,
    height: CORNER_LEN,
    borderTopWidth: CORNER_W,
    borderLeftWidth: CORNER_W,
    borderTopLeftRadius: 4,
  },
  cornerTR: {
    top: 0,
    right: 0,
    width: CORNER_LEN,
    height: CORNER_LEN,
    borderTopWidth: CORNER_W,
    borderRightWidth: CORNER_W,
    borderTopRightRadius: 4,
  },
  cornerBL: {
    bottom: 0,
    left: 0,
    width: CORNER_LEN,
    height: CORNER_LEN,
    borderBottomWidth: CORNER_W,
    borderLeftWidth: CORNER_W,
    borderBottomLeftRadius: 4,
  },
  cornerBR: {
    bottom: 0,
    right: 0,
    width: CORNER_LEN,
    height: CORNER_LEN,
    borderBottomWidth: CORNER_W,
    borderRightWidth: CORNER_W,
    borderBottomRightRadius: 4,
  },

  // ── Loading overlay ──────────────────────────────────────────────────────────
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.md,
  },
  loadingText: {
    fontSize: 15,
    fontFamily: 'Inter_400Regular',
    color: '#fff',
  },

  // ── Not found overlay ────────────────────────────────────────────────────────
  notFoundOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
  },
  notFoundCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.xl,
    alignItems: 'center',
    gap: spacing.md,
    width: '100%',
  },
  notFoundTitle: {
    fontSize: 20,
    fontFamily: 'Inter_700Bold',
    color: colors.text,
  },
  notFoundSub: {
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
    color: colors.textMuted,
    textAlign: 'center',
  },
  scanAgainBtn: {
    backgroundColor: colors.primary,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    width: '100%',
    alignItems: 'center',
  },
  scanAgainText: {
    fontSize: 15,
    fontFamily: 'Inter_700Bold',
    color: '#000',
  },
  searchManualBtn: {
    paddingVertical: spacing.sm,
  },
  searchManualText: {
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
    color: colors.textMuted,
    textDecorationLine: 'underline',
  },
});
