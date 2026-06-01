import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, ArrowLeft } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY ?? '');

interface LocationState {
  clientSecret: string;
  paymentIntentId: string;
  lineItems: { itemName: string; quantity: number; unitPrice: number; lineTotal: number; quantityUnit: string }[];
  amount: number;
}

function CheckoutForm({ lineItems, amount, paymentIntentId }: Pick<LocationState, 'lineItems' | 'amount' | 'paymentIntentId'>) {
  const stripe = useStripe();
  const elements = useElements();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stripe || !elements) return;

    setSubmitting(true);

    // redirect: 'if_required' → Stripe returns { paymentIntent } for cards that
    // confirm in-browser (no 3DS redirect needed). Without this, v9 may redirect
    // the page but not call back here, leaving the button spinning forever.
    const { error, paymentIntent } = await stripe.confirmPayment({
      elements,
      confirmParams: {
        return_url: `${window.location.origin}/payment-success`,
      },
      redirect: 'if_required',
    }) as any;

    if (error) {
      toast({ title: 'Payment failed', description: error.message, variant: 'destructive' });
      setSubmitting(false);
    } else if (paymentIntent) {
      // Payment confirmed in-browser — navigate manually to the success page
      navigate(`/payment-success?payment_intent=${paymentIntentId}&redirect_status=${paymentIntent.status}`);
    }
    // If neither: Stripe handled a redirect itself (return_url was followed)
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="space-y-2">
        {lineItems.map((item, i) => (
          <div key={i} className="flex justify-between text-sm">
            <span className="text-muted-foreground">{item.itemName} × {item.quantity} {item.quantityUnit}</span>
            <span>${item.lineTotal.toFixed(2)}</span>
          </div>
        ))}
        <div className="flex justify-between font-bold text-base border-t pt-2">
          <span>Total</span>
          <span>${amount.toFixed(2)}</span>
        </div>
      </div>

      <PaymentElement />

      <Button type="submit" className="w-full gradient-primary text-black font-medium" disabled={!stripe || submitting}>
        {submitting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
        Pay ${amount.toFixed(2)}
      </Button>
    </form>
  );
}

export default function CheckoutPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const state = location.state as LocationState | null;

  useEffect(() => {
    if (!state?.clientSecret) navigate('/sales-order-points', { replace: true });
  }, [state, navigate]);

  if (!state?.clientSecret) return null;

  const options = {
    clientSecret: state.clientSecret,
    appearance: { theme: 'night' as const, variables: { colorPrimary: '#22c55e' } },
  };

  return (
    <DashboardLayout>
      <div className="max-w-lg mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => navigate('/sales-order-points')}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold">Checkout</h1>
            <p className="text-muted-foreground text-sm">Complete your payment</p>
          </div>
        </div>

        <div className="rounded-md border border-yellow-500/40 bg-yellow-500/10 px-4 py-3 text-sm text-yellow-300 font-medium">
          TEST MODE — No real money will be charged.<br />
          Use card: <span className="font-mono">4242 4242 4242 4242</span> · Any future date · Any CVC
        </div>

        <Card>
          <CardContent className="p-6">
            <Elements stripe={stripePromise} options={options}>
              <CheckoutForm lineItems={state.lineItems} amount={state.amount} paymentIntentId={state.paymentIntentId} />
            </Elements>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
