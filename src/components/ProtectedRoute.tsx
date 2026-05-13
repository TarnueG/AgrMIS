import { Navigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { usePermissions } from '@/hooks/usePermissions';
import { Loader2 } from 'lucide-react';

interface Props {
  children: React.ReactNode;
  subsystem?: string;
}

export function ProtectedRoute({ children, subsystem }: Props) {
  const { user, loading: authLoading } = useAuth();
  const { canView, isLoading: permsLoading } = usePermissions();

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background dark">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) return <Navigate to="/auth" replace />;

  // If a subsystem gate is specified, wait for permissions then check
  if (subsystem && !permsLoading && !canView(subsystem)) {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
}
