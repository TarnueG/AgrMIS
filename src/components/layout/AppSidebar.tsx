import { Link, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useRef, useEffect } from 'react';
import api from '@/lib/api';
import {
  LayoutDashboard,
  Users,
  Wheat,
  Tractor,
  Package,
  ShoppingCart,
  Factory,
  DollarSign,
  BarChart3,
  Settings,
  Shield,
  Truck,
  UserCog,
  ChevronDown,
  LogOut,
  Leaf,
} from 'lucide-react';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar';
import { useAuth } from '@/hooks/useAuth';
import { usePermissions } from '@/hooks/usePermissions';
import { Button } from '@/components/ui/button';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { useState } from 'react';

// Each leaf item declares which subsystem key gates its visibility.
// Group items are visible if at least one child is visible.
const menuItems = [
  {
    title: 'Dashboard',
    icon: LayoutDashboard,
    path: '/dashboard',
    subsystem: 'dashboard',
  },
  {
    title: 'Asset Management',
    icon: Tractor,
    items: [
      { title: 'Land Parcels', path: '/assets/land',      icon: Wheat,   subsystem: 'land_parcels' },
      { title: 'Machinery',    path: '/assets/machinery', icon: Tractor, subsystem: 'machinery'    },
    ],
  },
  {
    title: 'Inventory',
    icon: Package,
    path: '/inventory',
    subsystem: 'inventory',
  },
  {
    title: 'Procurement',
    icon: Truck,
    path: '/procurement',
    subsystem: 'procurement',
  },
  {
    title: 'CRM',
    icon: Users,
    path: '/customers',
    subsystem: 'crm',
  },
  {
    title: 'Marketing',
    icon: ShoppingCart,
    items: [
      { title: 'Marketing Dashboard',  path: '/marketing',          icon: ShoppingCart, subsystem: 'marketing'          },
      { title: 'Sales & Order Points', path: '/sales-order-points', icon: Factory,      subsystem: 'sales_order_points' },
    ],
  },
  {
    title: 'Production',
    icon: Factory,
    items: [
      { title: 'Production',          path: '/production',       icon: Factory, subsystem: 'production' },
      { title: 'Livestock Dashboard', path: '/assets/livestock', icon: Leaf,    subsystem: 'livestock'  },
    ],
  },
  {
    title: 'Finance',
    icon: DollarSign,
    path: '/finance',
    subsystem: 'finance',
  },
  {
    title: 'Reports',
    icon: BarChart3,
    path: '/reports',
    subsystem: 'reports',
  },
  {
    title: 'Human Capital',
    icon: UserCog,
    path: '/employees',
    subsystem: 'human_capital',
  },
];

export function AppSidebar() {
  const location = useLocation();
  const { signOut, user } = useAuth();
  const { canView, isLoading: permsLoading } = usePermissions();
  const [openGroups, setOpenGroups] = useState<string[]>(['Asset Management', 'Marketing', 'Production']);
  const contentRef = useRef<HTMLDivElement>(null);

  const { data: alertData } = useQuery<{ count: number }>({
    queryKey: ['inventory-alert-count'],
    queryFn: () => api.get('/inventory/alerts/count'),
    refetchInterval: 60_000,
  });

  const { data: profile } = useQuery({
    queryKey: ['user-profile'],
    queryFn: () => api.get<any>('/profile'),
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
  });

  useEffect(() => {
    const saved = sessionStorage.getItem('sidebarScroll');
    if (saved && contentRef.current) {
      contentRef.current.scrollTop = Number(saved);
    }
  }, []);

  useEffect(() => {
    const saved = sessionStorage.getItem('sidebarScroll');
    if (!saved || !contentRef.current) return;
    const target = Number(saved);
    requestAnimationFrame(() => {
      if (contentRef.current) contentRef.current.scrollTop = target;
    });
  }, [openGroups]);

  const saveScroll = () => {
    if (contentRef.current) {
      sessionStorage.setItem('sidebarScroll', String(contentRef.current.scrollTop));
    }
  };

  const toggleGroup = (title: string) => {
    saveScroll();
    setOpenGroups(prev =>
      prev.includes(title) ? prev.filter(g => g !== title) : [...prev, title]
    );
  };

  const isActive = (path: string) => location.pathname === path;

  // Don't filter while permissions are loading — avoid flicker
  const itemVisible = (subsystem: string) => permsLoading || canView(subsystem);

  const visibleItems = menuItems
    .map(item => {
      if ('items' in item) {
        const visibleChildren = item.items.filter(c => itemVisible(c.subsystem));
        return visibleChildren.length > 0 ? { ...item, items: visibleChildren } : null;
      }
      return itemVisible(item.subsystem!) ? item : null;
    })
    .filter(Boolean) as typeof menuItems;

  return (
    <Sidebar className="border-r border-sidebar-border">
      <SidebarHeader className="border-b border-sidebar-border p-4">
        <Link to="/dashboard" className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg gradient-primary glow-primary">
            <Leaf className="h-6 w-6 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-sidebar-foreground">Agri-Tech</h1>
            <p className="text-xs text-sidebar-foreground/60">Farm Management</p>
          </div>
        </Link>
      </SidebarHeader>

      <SidebarContent ref={contentRef} onScroll={saveScroll} className="px-2 py-4">
        <SidebarGroup>
          <SidebarGroupLabel className="text-sidebar-foreground/50 text-xs uppercase tracking-wider mb-2">
            Main Menu
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {visibleItems.map((item) =>
                'items' in item ? (
                  <Collapsible
                    key={item.title}
                    open={openGroups.includes(item.title)}
                    onOpenChange={() => toggleGroup(item.title)}
                  >
                    <SidebarMenuItem>
                      <CollapsibleTrigger asChild>
                        <SidebarMenuButton className="w-full justify-between hover:bg-sidebar-accent">
                          <span className="flex items-center gap-3">
                            <item.icon className="h-4 w-4" />
                            {item.title}
                          </span>
                          <ChevronDown
                            className={`h-4 w-4 transition-transform ${
                              openGroups.includes(item.title) ? 'rotate-180' : ''
                            }`}
                          />
                        </SidebarMenuButton>
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <div className="ml-4 mt-1 space-y-1 border-l border-sidebar-border pl-4">
                          {item.items.map((subItem) => (
                            <Link key={subItem.path} to={subItem.path}>
                              <SidebarMenuButton
                                className={`w-full ${
                                  isActive(subItem.path)
                                    ? 'bg-sidebar-primary text-sidebar-primary-foreground'
                                    : 'hover:bg-sidebar-accent'
                                }`}
                              >
                                <subItem.icon className="h-4 w-4" />
                                {subItem.title}
                              </SidebarMenuButton>
                            </Link>
                          ))}
                        </div>
                      </CollapsibleContent>
                    </SidebarMenuItem>
                  </Collapsible>
                ) : (
                  <SidebarMenuItem key={(item as any).path}>
                    <Link to={(item as any).path}>
                      <SidebarMenuButton
                        className={`w-full ${
                          isActive((item as any).path)
                            ? 'bg-sidebar-primary text-sidebar-primary-foreground'
                            : 'hover:bg-sidebar-accent'
                        }`}
                      >
                        <item.icon className="h-4 w-4" />
                        <span className="flex-1">{item.title}</span>
                        {item.title === 'Inventory' && (alertData?.count ?? 0) > 0 && (
                          <span className="ml-auto text-xs bg-destructive text-destructive-foreground rounded-full px-1.5 py-0.5 leading-none">
                            {alertData!.count}
                          </span>
                        )}
                      </SidebarMenuButton>
                    </Link>
                  </SidebarMenuItem>
                )
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border p-4">
        <div className="flex items-center gap-3 mb-3">
          <div className="h-9 w-9 rounded-full bg-sidebar-accent overflow-hidden flex items-center justify-center shrink-0">
            {profile?.profilePictureUrl ? (
              <img src={profile.profilePictureUrl} alt="Profile" className="h-full w-full object-cover" />
            ) : (
              <span className="text-xs font-bold text-sidebar-foreground">
                {profile?.fullName
                  ? profile.fullName.split(' ').map((p: string) => p[0]).slice(0, 2).join('').toUpperCase()
                  : (user?.email?.[0] ?? 'U').toUpperCase()}
              </span>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-sidebar-foreground truncate capitalize">
              {profile?.role?.replace(/_/g, ' ') ?? user?.email?.split('@')[0] ?? ''}
            </p>
            <p className="text-xs text-sidebar-foreground/60 truncate">
              {profile?.employee?.jobTitle ?? 'Staff'}
            </p>
          </div>
        </div>
        <Link to="/settings" className="block mb-1">
          <SidebarMenuButton
            className={`w-full ${isActive('/settings') ? 'bg-sidebar-primary text-sidebar-primary-foreground' : 'text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent'}`}
          >
            <Settings className="h-4 w-4 mr-2" />
            Settings
          </SidebarMenuButton>
        </Link>
        <Button
          variant="ghost"
          size="sm"
          onClick={signOut}
          className="w-full justify-start text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent"
        >
          <LogOut className="h-4 w-4 mr-2" />
          Sign Out
        </Button>
      </SidebarFooter>
    </Sidebar>
  );
}
