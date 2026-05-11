import { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { SidebarProvider, SidebarTrigger, SidebarInset } from '@/components/ui/sidebar';
import { AppSidebar } from './AppSidebar';
import { useAuth } from '@/hooks/useAuth';
import { useTheme } from '@/hooks/useTheme';
import { Navigate } from 'react-router-dom';
import { Skeleton } from '@/components/ui/skeleton';
import api from '@/lib/api';

interface DashboardLayoutProps {
  children: ReactNode;
}

export function DashboardLayout({ children }: DashboardLayoutProps) {
  const { user, loading } = useAuth();
  const { theme } = useTheme();
  const navigate = useNavigate();

  const { data: profile } = useQuery({
    queryKey: ['user-profile'],
    queryFn: () => api.get<any>('/profile'),
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
  });

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <Skeleton className="h-12 w-12 rounded-full" />
          <Skeleton className="h-4 w-32" />
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  const initials = profile?.fullName
    ? profile.fullName.split(' ').map((p: string) => p[0]).slice(0, 2).join('').toUpperCase()
    : (user.email?.[0] ?? 'U').toUpperCase();

  return (
    <SidebarProvider>
      <div className={`flex min-h-screen w-full ${theme === 'dark' ? 'dark' : ''}`}>
        <AppSidebar />
        <SidebarInset className="flex flex-col flex-1">
          <header className="flex h-14 items-center gap-4 border-b border-border bg-card/50 backdrop-blur-sm px-6">
            <SidebarTrigger className="text-muted-foreground hover:text-foreground" />
            <div className="flex-1" />
            <button
              onClick={() => navigate('/settings')}
              className="h-9 w-9 rounded-full overflow-hidden border-2 border-border hover:border-primary transition-colors flex items-center justify-center bg-sidebar-accent"
              title="Profile & Settings"
            >
              {profile?.profilePictureUrl ? (
                <img
                  src={profile.profilePictureUrl}
                  alt="Profile"
                  className="h-full w-full object-cover"
                />
              ) : (
                <span className="text-xs font-bold text-foreground">{initials}</span>
              )}
            </button>
          </header>
          <main className="flex-1 overflow-auto p-6 bg-background">
            {children}
          </main>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}
