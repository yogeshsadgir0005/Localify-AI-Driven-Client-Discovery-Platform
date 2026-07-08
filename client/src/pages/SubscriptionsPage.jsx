import { useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { Check, Loader2, Sparkles, Zap } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import Layout from '../layout/Layout';
import useAuth from '../hooks/useAuth';
import api from '../utils/axios';

const PLANS = [
  {
    id: 'free',
    name: 'Free',
    price: '₹0',
    description: 'Perfect for getting started.',
    features: [
      'View 6 local businesses per search',
      'Change location 3 times per week',
      'Basic contact details',
    ],
    buttonText: 'Current Plan',
    popular: false,
    icon: null,
  },
  {
    id: 'pro',
    name: 'Pro',
    price: '₹199',
    period: '/month',
    description: 'Unlocks deeper local discovery.',
    features: [
      'View up to 60 businesses per search',
      'Change location 10 times per week',
      'Full contact details & social links',
      'Priority support',
    ],
    buttonText: 'Upgrade to Pro',
    popular: true,
    icon: <Sparkles className="h-5 w-5 text-accent" />,
  },
  {
    id: 'max',
    name: 'Max',
    price: '₹499',
    period: '/month',
    description: 'Unlimited access to all data.',
    features: [
      'Unlimited businesses per search',
      'Unlimited location changes',
      'Full contact details & social links',
      '24/7 Priority support',
      'Export data (coming soon)',
    ],
    buttonText: 'Upgrade to Max',
    popular: false,
    icon: <Zap className="h-5 w-5 text-primary" />,
  },
];

const SubscriptionsPage = () => {
  const { user, mutate } = useAuth();
  const navigate = useNavigate();
  const [loadingPlanId, setLoadingPlanId] = useState(null);
  const [error, setError] = useState('');

  const loadRazorpay = () => {
    return new Promise((resolve) => {
      const script = document.createElement('script');
      script.src = 'https://checkout.razorpay.com/v1/checkout.js';
      script.onload = () => resolve(true);
      script.onerror = () => resolve(false);
      document.body.appendChild(script);
    });
  };

  const handleUpgrade = async (planId) => {
    if (planId === 'free' || planId === user?.plan) return;
    
    setLoadingPlanId(planId);
    setError('');
    
    try {
      // Create Order on our backend
      const { data: orderData } = await api.post('/subscriptions/create-order', { plan: planId });

      if (!orderData.success) {
        setError(orderData.message || 'Failed to create order');
        setLoadingPlanId(null);
        return;
      }

      if (orderData.isMock) {
        // Bypass Razorpay frontend SDK
        toast.success('Mock Mode: Simulating payment...');
        const verifyRes = await api.post('/subscriptions/verify-payment', {
          razorpay_order_id: orderData.orderId,
          razorpay_payment_id: 'mock_payment_id',
          razorpay_signature: 'mock_signature',
          plan: planId
        });

        if (verifyRes.data.success) {
          await mutate();
          toast.success(verifyRes.data.message);
          navigate('/search');
        }
        return;
      }

      const res = await loadRazorpay();
      if (!res) {
        setError('Failed to load Razorpay SDK. Check your connection.');
        setLoadingPlanId(null);
        return;
      }

      const options = {
        key: orderData.keyId,
        amount: orderData.amount,
        currency: orderData.currency,
        name: 'Localify',
        description: `Upgrade to ${planId.toUpperCase()} Plan (30 days)`,
        order_id: orderData.orderId,
        handler: async function (response) {
          try {
            // Verify payment on our backend
            const verifyRes = await api.post('/subscriptions/verify-payment', {
              razorpay_order_id: response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature,
              plan: planId
            });

            if (verifyRes.data.success) {
              await mutate(); // Refresh user state
              toast.success(verifyRes.data.message);
              navigate('/search');
            }
          } catch (err) {
            setError(err.response?.data?.message || 'Payment verification failed.');
          }
        },
        prefill: {
          name: user?.name,
          email: user?.email,
        },
        theme: {
          color: '#3B82F6',
        },
      };

      const paymentObject = new window.Razorpay(options);
      paymentObject.on('payment.failed', function (response) {
        setError(response.error.description || 'Payment failed.');
      });
      
      paymentObject.open();
    } catch (err) {
      setError(err.response?.data?.message || 'Something went wrong.');
    } finally {
      setLoadingPlanId(null);
    }
  };

  return (
    <Layout>
      <Helmet>
        <title>Upgrade Plan — Localify</title>
      </Helmet>
      
      <div className="mx-auto max-w-5xl px-4 py-12 sm:px-6 sm:py-16">
        <div className="text-center">
          <h1 className="font-display text-3xl font-bold text-text sm:text-4xl">
            Simple, transparent pricing
          </h1>
          <p className="mt-4 text-lg text-text-muted">
            Unlock the full potential of Localify and discover every hidden business in your city.
          </p>
        </div>

        {error && (
          <div className="mx-auto mt-8 max-w-md rounded-lg border border-red-500/20 bg-red-500/10 p-4 text-center text-sm text-red-500">
            {error}
          </div>
        )}

        <div className="mt-12 grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
          {PLANS.map((plan) => {
            const isCurrent = user?.plan === plan.id;
            
            return (
              <div
                key={plan.id}
                className={`relative flex flex-col rounded-2xl border bg-surface-1 p-8 shadow-sm transition-all ${
                  plan.popular
                    ? 'border-accent shadow-accent/10'
                    : 'border-border'
                }`}
              >
                {plan.popular && (
                  <div className="absolute -top-4 left-0 right-0 mx-auto w-32 rounded-full bg-accent px-3 py-1 text-center text-xs font-medium text-white">
                    Most Popular
                  </div>
                )}
                
                <div className="mb-6">
                  <div className="flex items-center gap-2">
                    {plan.icon}
                    <h3 className="font-display text-xl font-bold text-text">{plan.name}</h3>
                  </div>
                  <p className="mt-2 text-sm text-text-muted">{plan.description}</p>
                  <div className="mt-4 flex items-baseline text-4xl font-extrabold text-text">
                    {plan.price}
                    {plan.period && (
                      <span className="ml-1 text-lg font-medium text-text-muted">
                        {plan.period}
                      </span>
                    )}
                  </div>
                </div>

                <ul className="mb-8 flex-1 space-y-4">
                  {plan.features.map((feature, i) => (
                    <li key={i} className="flex items-start">
                      <Check className="mr-3 h-5 w-5 shrink-0 text-green-500" />
                      <span className="text-sm text-text-muted">{feature}</span>
                    </li>
                  ))}
                </ul>

                <button
                  type="button"
                  onClick={() => handleUpgrade(plan.id)}
                  disabled={isCurrent || loadingPlanId === plan.id || (plan.id === 'free' && user?.plan !== 'free')}
                  className={`mt-auto w-full rounded-lg px-4 py-3 text-center text-sm font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-background ${
                    isCurrent
                      ? 'cursor-not-allowed bg-surface-2 text-text-muted'
                      : plan.popular
                      ? 'bg-accent text-white hover:bg-accent/90 focus:ring-accent'
                      : plan.id === 'free' && user?.plan !== 'free'
                      ? 'cursor-not-allowed bg-surface-2 text-text-muted'
                      : 'bg-primary text-white hover:bg-primary/90 focus:ring-primary'
                  }`}
                >
                  {loadingPlanId === plan.id && !isCurrent ? (
                    <Loader2 className="mx-auto h-5 w-5 animate-spin" />
                  ) : isCurrent ? (
                    'Current Plan'
                  ) : (
                    plan.buttonText
                  )}
                </button>
              </div>
            );
          })}
        </div>
        
        <p className="mt-8 text-center text-xs text-text-muted">
          Prices are in Indian Rupees (INR). Payments are secure and encrypted via Razorpay. One-off payments grant 30 days of access.
        </p>
      </div>
    </Layout>
  );
};

export default SubscriptionsPage;
