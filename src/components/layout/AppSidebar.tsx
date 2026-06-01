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
      { title: 'Land Parcels',    path: '/assets/land',      icon: Wheat,    subsystem: 'land_parcels' },
      { title: 'Machinery',       path: '/assets/machinery', icon: Tractor,  subsystem: 'machinery'    },
      { title: 'Asset Analytics', path: '/assets/analytics', icon: BarChart3, subsystem: 'machinery'   },
    ],
  },
  {
    title: 'Inventory',
    icon: Package,
    items: [
      { title: 'Inventory Dashboard', path: '/inventory',           icon: Package,   subsystem: 'inventory' },
      { title: 'Inventory Analytics', path: '/inventory/analytics', icon: BarChart3, subsystem: 'inventory' },
    ],
  },
  {
    title: 'Procurement',
    icon: Truck,
    items: [
      { title: 'Overview',  path: '/procurement',           icon: Truck,    subsystem: 'procurement' },
      { title: 'Analytics', path: '/procurement/analytics', icon: BarChart3, subsystem: 'procurement' },
    ],
  },
  {
    title: 'CRM',
    icon: Users,
    items: [
<<<<<<< HEAD
      { title: 'Customers', path: '/customers', icon: Users, subsystem: 'crm' },
      { title: 'Analytics', path: '/crm/analytics', icon: BarChart3, subsystem: 'crm' },
=======
      { title: 'Customers',     path: '/customers',     icon: Users,    subsystem: 'crm' },
      { title: 'CRM Analytics', path: '/crm/analytics', icon: BarChart3, subsystem: 'crm' },
>>>>>>> 4a5051b8d808d34a3c2324862f447ea96d007414
    ],
  },
  {
    title: 'Marketing',
    icon: ShoppingCart,
    items: [
<<<<<<< HEAD
      { title: 'Marketing Dashboard',  path: '/marketing',          icon: ShoppingCart, subsystem: 'marketing'          },
      { title: 'Analytics',            path: '/marketing/analytics', icon: BarChart3,   subsystem: 'marketing'          },
      { title: 'Sales & Order Points', path: '/sales-order-points', icon: Factory,      subsystem: 'sales_order_points' },
=======
      { title: 'Marketing Dashboard',  path: '/marketing',           icon: ShoppingCart, subsystem: 'marketing'          },
      { title: 'Marketing Analytics',  path: '/marketing/analytics', icon: BarChart3,    subsystem: 'marketing'          },
      { title: 'Sales & Order Points', path: '/sales-order-points',  icon: Factory,      subsystem: 'sales_order_points' },
>>>>>>> 4a5051b8d808d34a3c2324862f447ea96d007414
    ],
  },
  {
    title: 'Production',
    icon: Factory,
    items: [
      { title: 'Production',           path: '/production',           icon: Factory,   subsystem: 'production' },
      { title: 'Production Analytics', path: '/production/analytics', icon: BarChart3, subsystem: 'production' },
      { title: 'Livestock Dashboard',  path: '/assets/livestock',     icon: Leaf,      subsystem: 'livestock'  },
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
<<<<<<< HEAD
  const [openGroups, setOpenGroups] = useState<string[]>(['Asset Management', 'Marketing', 'Production', 'Procurement', 'CRM']);
=======
  const [openGroups, setOpenGroups] = useState<string[]>(['Asset Management', 'Marketing', 'Production', 'Procurement', 'CRM', 'Inventory']);
>>>>>>> 4a5051b8d808d34a3c2324862f447ea96d007414
  const contentRef = useRef<HTMLDivElement>(null);

  const { data: alertData } = useQuery<{ count: number }>({
    queryKey: ['inventory-alert-count'],
    queryFn: () => api.get('/inventory/alerts/count'),
    refetchInterval: 60_000,
  });

  const { data: profile } = useQuery({
    queryKey: ['user-profile', user?.id],
    queryFn: () => api.get<any>('/profile'),
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
  });

  const isMarketingAnalytics = location.pathname.startsWith('/marketing/analytics');
  const { data: marketingSummary } = useQuery<any>({
    queryKey: ['marketing-analytics-sidebar-summary'],
    queryFn: () => api.get('/marketing/analytics/summary'),
    enabled: isMarketingAnalytics,
    staleTime: 30_000,
    refetchInterval: 30_000,
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

  const itemVisible = (subsystem: string) => !permsLoading && canView(subsystem);

  const visibleItems = menuItems
    .map(item => {
      if ('items' in item) {
        const visibleChildren = item.items.filter(c => itemVisible(c.subsystem));
        return visibleChildren.length > 0 ? { ...item, items: visibleChildren } : null;
      }
      return itemVisible(item.subsystem!) ? item : null;
    })
    .filter(Boolean) as typeof menuItems;

  if (isMarketingAnalytics) {
    const marketingNav = [
      { title: 'Dashboard', path: '/marketing/analytics', icon: LayoutDashboard },
      { title: 'Campaigns', path: '/marketing', icon: ShoppingCart },
      { title: 'Sales Report', path: '/sales-order-points', icon: Factory },
      { title: 'Purchase Orders', path: '/procurement', icon: Truck },
      { title: 'Audience', path: '/customers', icon: Users },
      { title: 'Settings', path: '/settings', icon: Settings },
    ];

    return (
      <Sidebar className="border-r-0">
        <SidebarHeader className="border-b-0 px-5 py-5" style={{ backgroundColor: '#181410' }}>
          <Link to="/marketing/analytics" className="flex items-center gap-3">
            <div
              className="flex h-12 w-12 items-center justify-center rounded-2xl"
              style={{ background: 'linear-gradient(135deg, #E2592A 0%, #C99A1E 100%)' }}
            >
              <BarChart3 className="h-6 w-6 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-extrabold tracking-[-0.03em] text-[#FFFCF6]" style={{ fontFamily: '"Bricolage Grotesque", sans-serif' }}>Lumen</h1>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#B8AA93]">Analytics</p>
            </div>
          </Link>
        </SidebarHeader>
        <SidebarContent className="px-4 py-4" style={{ backgroundColor: '#181410' }}>
          <SidebarGroup className="p-0">
            <SidebarGroupContent>
              <SidebarMenu className="gap-2">
                {marketingNav.map((item) => (
                  <SidebarMenuItem key={item.path}>
                    <Link to={item.path}>
                      <SidebarMenuButton
                        className="h-11 rounded-full px-4 text-sm"
                        style={
                          location.pathname === item.path
                            ? { background: 'linear-gradient(135deg, #E2592A 0%, #D04F23 100%)', color: '#FFFCF6' }
                            : { color: '#D5CAB9' }
                        }
                      >
                        <item.icon className="h-4 w-4" />
                        {item.title}
                      </SidebarMenuButton>
                    </Link>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
        <SidebarFooter className="mt-auto px-4 pb-5 pt-0" style={{ backgroundColor: '#181410' }}>
          <div className="rounded-[20px] border border-[#2A241E] bg-[#211B15] p-4 text-[#FFFCF6]">
            <p className="text-sm font-semibold">Monthly Target</p>
            <p className="mt-2 text-lg font-extrabold tracking-[-0.03em]" style={{ fontFamily: '"Bricolage Grotesque", sans-serif' }}>
              ${(marketingSummary?.currentMonthIncome ?? 0).toLocaleString('en-US')}
            </p>
            <p className="mt-1 text-xs text-[#B8AA93]">
              {marketingSummary?.targetProgress?.toFixed?.(1) ?? '0.0'}% of ${(marketingSummary?.monthlyTarget ?? 840000).toLocaleString('en-US')} goal
            </p>
            <div className="mt-4 h-2 rounded-full bg-[#3A2F24]">
              <div
                className="h-2 rounded-full"
                style={{
                  width: `${Math.min(100, marketingSummary?.targetProgress ?? 0)}%`,
                  background: 'linear-gradient(90deg, #E2592A 0%, #C99A1E 100%)',
                }}
              />
            </div>
          </div>
          <div className="mt-4 flex items-center gap-3 px-1">
            <div className="h-9 w-9 rounded-2xl bg-[#2A241E] overflow-hidden flex items-center justify-center shrink-0">
              {profile?.profilePictureUrl ? (
                <img src={profile.profilePictureUrl} alt="Profile" className="h-full w-full object-cover" />
              ) : (
                <span className="text-xs font-bold text-[#FFFCF6]">
                  {profile?.fullName
                    ? profile.fullName.split(' ').map((p: string) => p[0]).slice(0, 2).join('').toUpperCase()
                    : (user?.email?.[0] ?? 'U').toUpperCase()}
                </span>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-[#FFFCF6]">
                {profile?.role?.replace(/_/g, ' ') ?? user?.email?.split('@')[0] ?? ''}
              </p>
              <p className="truncate text-xs text-[#B8AA93]">{profile?.employee?.jobTitle ?? 'Staff'}</p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={signOut}
            className="mt-3 w-full justify-start rounded-full text-[#D5CAB9] hover:bg-[#2A241E] hover:text-[#FFFCF6]"
          >
            <LogOut className="mr-2 h-4 w-4" />
            Sign Out
          </Button>
        </SidebarFooter>
      </Sidebar>
    );
  }

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
