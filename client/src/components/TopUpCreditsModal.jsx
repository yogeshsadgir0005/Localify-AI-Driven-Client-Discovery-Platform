import { useState } from 'react';
import { Loader2, Zap, X } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../utils/axios';
import { useAuth } from '../hooks/useAuth';

const TopUpCreditsModal = ({ isOpen, onClose, onSuccess }) => {
  const { user, refreshProfile } = useAuth();
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  const loadRazorpay = () => {
    return new Promise((resolve) => {
      const script = document.createElement('script');
      script.src = 'https://checkout.razorpay.com/v1/checkout.js';
      script.onload = () => resolve(true);
      script.onerror = () => resolve(false);
      document.body.appendChild(script);
    });
  };

  const handleTopUp = async () => {
    setLoading(true);
    
    try {
      const { data: orderData } = await api.post('/subscriptions/create-topup-order', { packageId: 'topup_ai_5' });

      if (!orderData.success) {
        toast.error(orderData.message || 'Failed to create top-up order');
        setLoading(false);
        return;
      }

      const res = await loadRazorpay();
      if (!res) {
        toast.error('Failed to load Razorpay SDK.');
        setLoading(false);
        return;
      }

      const options = {
        key: orderData.keyId,
        amount: orderData.amount,
        currency: orderData.currency,
        name: 'Localify',
        description: `Top-up 5 AI Website Credits`,
        order_id: orderData.orderId,
        handler: async function (response) {
          try {
            const verifyRes = await api.post('/subscriptions/verify-topup', {
              razorpay_order_id: response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature,
              packageId: 'topup_ai_5'
            });

            if (verifyRes.data.success) {
              await refreshProfile();
              toast.success(verifyRes.data.message);
              onSuccess();
            }
          } catch (err) {
            toast.error(err.response?.data?.message || 'Payment verification failed.');
          }
        },
        prefill: {
          name: user?.name,
          email: user?.email,
        },
        theme: {
          color: '#3B82F6',
          backdrop_color: 'transparent',
        },
      };

      const paymentObject = new window.Razorpay(options);
      paymentObject.on('payment.failed', function (response) {
        toast.error(response.error.description || 'Payment failed.');
      });
      
      paymentObject.open();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-sm overflow-hidden rounded-2xl bg-surface p-6 shadow-2xl ring-1 ring-border">
        <button
          onClick={onClose}
          className="absolute right-4 top-4 text-text-muted hover:text-text"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-accent/20">
            <Zap className="h-6 w-6 text-accent" />
          </div>
          <h2 className="mt-4 font-display text-xl font-bold text-text">Top Up Credits</h2>
          <p className="mt-2 text-sm text-text-muted">
            Get 5 extra AI Website Generation credits instantly. They never expire!
          </p>
        </div>

        <div className="my-6 rounded-xl border border-accent bg-accent/10 p-4 text-center">
          <div className="text-2xl font-black text-text">₹99</div>
          <div className="text-sm font-medium text-accent">5 Credits</div>
        </div>

        <button
          onClick={handleTopUp}
          disabled={loading}
          className="btn-primary w-full gap-2 bg-accent hover:bg-accent/90"
        >
          {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : 'Buy Now via Razorpay'}
        </button>
      </div>
    </div>
  );
};

export default TopUpCreditsModal;
