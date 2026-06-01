import { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import api from '@/lib/api';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { CheckCircle, Loader2, ShoppingBag } from 'lucide-react';

export default function PaymentSuccessPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const paymentIntentId = params.get('payment_intent');
  const redirectStatus = params.get('redirect_status');
  const [status, setStatus] = useState<'loading' | 'paid' | 'pending' | 'error'>('loading');
  const [orders, setOrders] = useState<any[]>([]);

  useEffect(() => {
    if (!paymentIntentId) { navigate('/sales-order-points', { replace: true }); return; }

    // If Stripe (or our own navigate) already signalled failure, show it immediately
    if (redirectStatus === 'failed') {
      setStatus('error');
      return;
    }

    let attempts = 0;
    const poll = async () => {
      try {
        const result = await api.get<any>(`/marketing/payments/status/${paymentIntentId}`);
        const ps = result?.transaction?.payment_status;
        if (ps === 'paid') {
          setOrders(result.orders ?? []);
          setStatus('paid');
        } else if (ps === 'failed') {
          setStatus('error');
        } else if (attempts < 10) {
          attempts++;
          setTimeout(poll, 2000);
        } else {
          setStatus('pending');
        }
      } catch {
        setStatus('error');
      }
    };
    poll();
  }, [paymentIntentId, redirectStatus, navigate]);

  return (
    <DashboardLayout>
      <div className="max-w-lg mx-auto pt-12 space-y-6">
        <Card>
          <CardContent className="p-10 text-center space-y-6">
            {status === 'loading' && (
              <>
                <Loader2 className="h-16 w-16 mx-auto animate-spin text-primary" />
                <p className="text-muted-foreground">Confirming your payment…</p>
              </>
            )}
            {status === 'paid' && (
              <>
                <CheckCircle className="h-16 w-16 mx-auto text-success" />
                <div>
                  <h2 className="text-2xl font-bold">Payment Successful</h2>
                  <p className="text-muted-foreground mt-1">Your orders have been confirmed.</p>
                </div>
                {orders.length > 0 && (
                  <div className="text-left space-y-1 border rounded-md p-4 text-sm">
                    {orders.map((o: any) => (
                      <div key={o.id} className="flex justify-between">
                        <span className="font-mono text-muted-foreground">{o.order_id}</span>
                        <span>{o.item_name} × {Number(o.quantity).toFixed(2)} {o.quantity_unit}</span>
                        <span>${Number(o.amount).toFixed(2)}</span>
                      </div>
                    ))}
                  </div>
                )}
                <Button className="gradient-primary text-black font-medium w-full" onClick={() => navigate('/sales-order-points')}>
                  <ShoppingBag className="h-4 w-4 mr-2" />Back to Sales
                </Button>
              </>
            )}
            {status === 'pending' && (
              <>
                <Loader2 className="h-16 w-16 mx-auto text-warning" />
                <div>
                  <h2 className="text-xl font-bold">Payment Processing</h2>
                  <p className="text-muted-foreground mt-1">Your payment is still being processed. Orders will confirm shortly.</p>
                </div>
                <Button variant="outline" className="border border-input bg-background text-white hover:bg-accent w-full" onClick={() => navigate('/sales-order-points')}>
                  Back to Sales
                </Button>
              </>
            )}
            {status === 'error' && (
              <>
                <div className="h-16 w-16 mx-auto rounded-full bg-destructive/20 flex items-center justify-center">
                  <span className="text-destructive text-3xl font-bold">✕</span>
                </div>
                <div>
                  <h2 className="text-xl font-bold">Payment Failed</h2>
                  <p className="text-muted-foreground mt-1">Your payment could not be processed.</p>
                </div>
                <div className="flex gap-3">
                  <Button variant="outline" className="border border-input bg-background text-white hover:bg-accent flex-1" onClick={() => navigate('/sales-order-points')}>
                    Back to Sales
                  </Button>
                  <Button className="gradient-primary text-black font-medium flex-1" onClick={() => navigate('/checkout')}>
                    Try Again
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
