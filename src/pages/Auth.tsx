import { useState } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { Leaf, Loader2 } from 'lucide-react';

export default function Auth() {
  const { signIn, user, loading } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [isLoading, setIsLoading] = useState(false);
  const [personnelData, setPersonnelData] = useState({ identifier: '', password: '' });
  const [customerData, setCustomerData] = useState({ identifier: '', password: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background dark">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (user) {
    return <Navigate to="/dashboard" replace />;
  }

  const validate = (data: { identifier: string; password: string }, prefix: string) => {
    const newErrors: Record<string, string> = {};
    if (!data.identifier.trim()) newErrors[`${prefix}Identifier`] = 'Username or email is required';
    if (data.password.length < 1) newErrors[`${prefix}Password`] = 'Password is required';
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleLogin = async (e: React.FormEvent, data: { identifier: string; password: string }, prefix: string) => {
    e.preventDefault();
    if (!validate(data, prefix)) return;

    setIsLoading(true);
    const { error } = await signIn(data.identifier, data.password);
    setIsLoading(false);

    if (error) {
      toast({
        title: 'Login Failed',
        description: 'Invalid username/email or password. Please try again.',
        variant: 'destructive',
      });
    } else {
      navigate('/dashboard');
    }
  };

  const loginForm = (
    data: { identifier: string; password: string },
    setData: React.Dispatch<React.SetStateAction<{ identifier: string; password: string }>>,
    prefix: string
  ) => (
    <form onSubmit={(e) => handleLogin(e, data, prefix)} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor={`${prefix}-identifier`}>Username or Email</Label>
        <Input
          id={`${prefix}-identifier`}
          type="text"
          placeholder="username or you@example.com"
          value={data.identifier}
          onChange={(e) => setData({ ...data, identifier: e.target.value })}
        />
        {errors[`${prefix}Identifier`] && (
          <p className="text-sm text-destructive">{errors[`${prefix}Identifier`]}</p>
        )}
      </div>
      <div className="space-y-2">
        <Label htmlFor={`${prefix}-password`}>Password</Label>
        <Input
          id={`${prefix}-password`}
          type="password"
          placeholder="••••••••"
          value={data.password}
          onChange={(e) => setData({ ...data, password: e.target.value })}
        />
        {errors[`${prefix}Password`] && (
          <p className="text-sm text-destructive">{errors[`${prefix}Password`]}</p>
        )}
      </div>
      <Button type="submit" className="w-full gradient-primary text-black font-medium" disabled={isLoading}>
        {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        Sign In
      </Button>
    </form>
  );

  return (
    <div className="min-h-screen flex items-center justify-center bg-background dark p-4">
      <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-background to-accent/5" />

      <Card className="w-full max-w-md relative z-10 glass">
        <CardHeader className="text-center space-y-4">
          <div className="flex justify-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl gradient-primary glow-primary">
              <Leaf className="h-8 w-8 text-primary-foreground" />
            </div>
          </div>
          <div>
            <CardTitle className="text-2xl font-bold">Agri-Tech</CardTitle>
            <CardDescription>Agricultural Management Information System</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="personnel" className="w-full">
            <TabsList className="grid w-full grid-cols-2 mb-6">
              <TabsTrigger value="personnel">Personnel</TabsTrigger>
              <TabsTrigger value="customer">Customer</TabsTrigger>
            </TabsList>

            <TabsContent value="personnel">
              {loginForm(personnelData, setPersonnelData, 'personnel')}
            </TabsContent>

            <TabsContent value="customer">
              {loginForm(customerData, setCustomerData, 'customer')}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
