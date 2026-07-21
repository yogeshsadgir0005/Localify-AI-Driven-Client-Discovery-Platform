import React from 'react';
import { Modal, View, StyleSheet, Pressable, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import { Ionicons } from '@expo/vector-icons';
import { Text } from './ui';
import { colors, font } from '../theme/colors';

/**
 * In-app Razorpay checkout rendered inside a WebView — the Expo Go-friendly way
 * to take a payment without the native SDK. Given an order created by our
 * backend, it loads Razorpay Checkout, and posts the result back to RN.
 *
 * Props:
 *  - visible: bool
 *  - order: { orderId, amount, keyId }
 *  - description: string
 *  - user: { name, email, phone }
 *  - onSuccess: (payment) => void   // { razorpay_order_id, razorpay_payment_id, razorpay_signature }
 *  - onDismiss: () => void
 *  - onError: (msg) => void
 */
export default function RazorpayCheckout({ visible, order, description, user = {}, onSuccess, onDismiss, onError }) {
  if (!order?.orderId) return null;

  const html = `<!doctype html><html><head>
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0">
    <script src="https://checkout.razorpay.com/v1/checkout.js"></script>
    <style>html,body{margin:0;height:100%;background:#0D0F14;}</style>
  </head><body><script>
    function post(o){ if(window.ReactNativeWebView) window.ReactNativeWebView.postMessage(JSON.stringify(o)); }
    try {
      var rzp = new Razorpay({
        key: ${JSON.stringify(order.keyId || '')},
        order_id: ${JSON.stringify(order.orderId)},
        amount: ${JSON.stringify(order.amount)},
        currency: 'INR',
        name: 'Localify',
        description: ${JSON.stringify(description || 'Localify')},
        prefill: { name: ${JSON.stringify(user.name || '')}, email: ${JSON.stringify(user.email || '')}, contact: ${JSON.stringify(user.phone || '')} },
        theme: { color: '#6C63FF' },
        handler: function(r){ post({ type:'success', razorpay_order_id:r.razorpay_order_id, razorpay_payment_id:r.razorpay_payment_id, razorpay_signature:r.razorpay_signature }); },
        modal: { ondismiss: function(){ post({ type:'dismiss' }); }, escape: true, backdropclose: false }
      });
      rzp.on('payment.failed', function(resp){ post({ type:'failed', error: (resp && resp.error && resp.error.description) || 'Payment failed' }); });
      rzp.open();
    } catch(e){ post({ type:'failed', error: String(e && e.message || e) }); }
  </script></body></html>`;

  const handleMessage = (e) => {
    let data = {};
    try { data = JSON.parse(e.nativeEvent.data); } catch { return; }
    if (data.type === 'success') onSuccess?.(data);
    else if (data.type === 'dismiss') onDismiss?.();
    else if (data.type === 'failed') onError?.(data.error || 'Payment failed');
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onDismiss}>
      <SafeAreaView style={styles.root} edges={['top']}>
        <View style={styles.head}>
          <Text style={{ fontFamily: font.displaySemi, fontSize: 16, color: colors.text }}>Secure payment</Text>
          <Pressable onPress={onDismiss} hitSlop={12}><Ionicons name="close" size={24} color={colors.textMuted} /></Pressable>
        </View>
        <WebView
          originWhitelist={['*']}
          source={{ html, baseUrl: 'https://checkout.razorpay.com' }}
          onMessage={handleMessage}
          javaScriptEnabled
          domStorageEnabled
          startInLoadingState
          renderLoading={() => (
            <View style={styles.loading}><ActivityIndicator color={colors.primary} size="large" /></View>
          )}
          style={{ flex: 1, backgroundColor: colors.bg }}
        />
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border },
  loading: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg },
});
