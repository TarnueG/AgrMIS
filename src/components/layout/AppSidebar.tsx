import { Link, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import api from '@/lib/api';
import {
  BarChart3,
  ChevronDown,
  ClipboardList,
  DollarSign,
  Factory,
  LayoutDashboard,
  Leaf,
  LogOut,
  Package,
  Settings,
  Shield,
  ShoppingCart,
  Tractor,
  Truck,
  UserCog,
  Users,
  Wheat,
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
import { Button } from '@/components/ui/button';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { useAuth } from '@/hooks/useAuth';
import { usePermissions } from '@/hooks/usePermissions';
import { isAdminRole, isCustomerRole } from '@/lib/roles';

type MenuLeaf = {
  title: string;
  icon: any;
  path: string;
  subsystem?: string;
  adminOnly?: boolean;
};

type MenuGroup = {
  title: string;
  icon: any;
  items: MenuLeaf[];
};

const INTERNAL_MENU: Array<MenuLeaf | MenuGroup> = [
  { title: 'Dashboard', icon: LayoutDashboard, path: '/dashboard', subsystem: 'dashboard' },
  { title: 'Inventory Management', icon: Package, path: '/inventory', subsystem: 'inventory' },
  { title: 'Procurement', icon: Truck, path: '/procurement', subsystem: 'procurement' },
  {
    title: 'Sales & Distribution',
    icon: ShoppingCart,
    items: [
      { title: 'Orders', icon: ShoppingCart, path: '/orders', subsystem: 'sales_order_points' },
      { title: 'Sales & Order Points', icon: Factory, path: '/sales-order-points', subsystem: 'sales_order_points' },
      { title: 'Marketing', icon: BarChart3, path: '/marketing', subsystem: 'marketing' },
    ],
  },
  { title: 'Customers / CRM', icon: Users, path: '/customers', subsystem: 'crm' },
  {
    title: 'Production Management',
    icon: Factory,
    items: [
      { title: 'Production', icon: Factory, path: '/production', subsystem: 'production' },
      { title: 'Livestock / Farm Ops', icon: Leaf, path: '/assets/livestock', subsystem: 'livestock' },
    ],
  },
  { title: 'HR / Labor Management', icon: UserCog, path: '/employees', subsystem: 'human_capital' },
  {
    title: 'Asset Management',
    icon: Tractor,
    items: [
      { title: 'Machinery', icon: Tractor, path: '/assets/machinery', subsystem: 'machinery' },
      { title: 'Land Parcels', icon: Wheat, path: '/assets/land', subsystem: 'land_parcels' },
    ],
  },
  { title: 'Finance / Accounting', icon: DollarSign, path: '/finance', subsystem: 'finance' },
  { title: 'Reports / Analytics', icon: BarChart3, path: '/reports', subsystem: 'reports' },
  { title: 'Settings', icon: Settings, path: '/settings', subsystem: 'settings' },
  { title: 'Access Control', icon: Shield, path: '/access-control', subsystem: 'access_control' },
  { title: 'Audit Logs', icon: ClipboardList, path: '/settings?panel=audit-log', subsystem: 'audit_logs' },
];

const CUSTOMER_MENU: MenuLeaf[] = [
  { title: 'Customer Portal', icon: LayoutDashboard, path: '/customer' },
  { title: 'Sales & Order Points', icon: ShoppingCart, path: '/sales-order-points', subsystem: 'sales_order_points' },
  { title: 'Marketing', icon: BarChart3, path: '/marketing', subsystem: 'marketing' },
  { title: 'Settings', icon: Settings, path: '/settings', subsystem: 'settings' },
];

export function AppSidebar() {
  const location = useLocation();
  const { signOut, user } = useAuth();
  const { canView } = usePermissions();
  const defaultOpenGroups = ['Sales & Distribution', 'Production Management', 'Asset Management'];
  const [openGroups, setOpenGroups] = useState<string[]>(defaultOpenGroups);
  const contentRef = useRef<HTMLDivElement>(null);
  const customerRole = isCustomerRole(user?.role);
  const adminRole = isAdminRole(user?.role);
  const canSeeInventory = canView('inventory');

  const { data: alertData } = useQuery<{ count: number }>({
    queryKey: ['inventory-alert-count'],
    queryFn: () => api.get('/inventory/alerts/count'),
    enabled: !customerRole && canSeeInventory,
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
    setOpenGroups((prev) =>
      prev.includes(title) ? prev.filter((group) => group !== title) : [...prev, title]
    );
  };

  const isPathActive = (path: string) => {
    const current = `${location.pathname}${location.search}`;
    if (path.includes('?')) return current === path;
    return location.pathname === path;
  };

  const leafVisible = (item: MenuLeaf) => {
    if (item.adminOnly && !adminRole) return false;
    if (!item.subsystem) return true;
    return canView(item.subsystem);
  };

  const menu = customerRole ? CUSTOMER_MENU : INTERNAL_MENU;
  const visibleItems = menu
    .map((item) => {
      if ('items' in item) {
        const visibleChildren = item.items.filter(leafVisible);
        return visibleChildren.length > 0 ? { ...item, items: visibleChildren } : null;
      }
      return leafVisible(item) ? item : null;
    })
    .filter(Boolean) as Array<MenuLeaf | MenuGroup>;

  useEffect(() => {
    const activeGroupTitles = visibleItems
      .filter((item): item is MenuGroup => 'items' in item)
      .filter((item) => item.items.some((subItem) => isPathActive(subItem.path)))
      .map((item) => item.title);

    if (!activeGroupTitles.length) return;

    setOpenGroups((prev) => {
      if (activeGroupTitles.every((title) => prev.includes(title))) {
        return prev;
      }

      return Array.from(new Set([...prev, ...activeGroupTitles]));
    });
  }, [location.pathname, location.search, visibleItems]);

  const homePath = customerRole ? '/customer' : '/dashboard';

  return (
    <Sidebar className="border-r border-sidebar-border">
      <SidebarHeader className="border-b border-sidebar-border p-4">
        <Link to={homePath} className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg gradient-primary glow-primary">
            <Leaf className="h-6 w-6 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-sidebar-foreground">Agri-Tech</h1>
            <p className="text-xs text-sidebar-foreground/60">
              {customerRole ? 'Customer Portal' : 'AMIS Internal System'}
            </p>
          </div>
        </Link>
      </SidebarHeader>

      <SidebarContent ref={contentRef} onScroll={saveScroll} className="px-2 py-4">
        <SidebarGroup>
          <SidebarGroupLabel className="mb-2 text-xs uppercase tracking-wider text-sidebar-foreground/50">
            {customerRole ? 'Portal Menu' : 'Main Menu'}
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {visibleItems.map((item) => {
                if ('items' in item) {
                  const groupIsActive = item.items.some((subItem) => isPathActive(subItem.path));

                  return (
                    <Collapsible key={item.title} open={openGroups.includes(item.title)} onOpenChange={() => toggleGroup(item.title)}>
                      <SidebarMenuItem>
                        <CollapsibleTrigger asChild>
                          <SidebarMenuButton
                            className={`w-full justify-between ${
                              groupIsActive ? 'bg-sidebar-primary/15 text-sidebar-foreground' : 'hover:bg-sidebar-accent'
                            }`}
                          >
                            <span className="flex items-center gap-3">
                              <item.icon className="h-4 w-4" />
                              {item.title}
                            </span>
                            <ChevronDown
                              className={`h-4 w-4 transition-transform ${openGroups.includes(item.title) ? 'rotate-180' : ''}`}
                            />
                          </SidebarMenuButton>
                        </CollapsibleTrigger>
                        <CollapsibleContent>
                          <div className="ml-4 mt-1 space-y-1 border-l border-sidebar-border pl-4">
                            {item.items.map((subItem) => (
                              <Link key={subItem.path} to={subItem.path}>
                                <SidebarMenuButton
                                  className={`w-full ${isPathActive(subItem.path) ? 'bg-sidebar-primary text-sidebar-primary-foreground' : 'hover:bg-sidebar-accent'}`}
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
                  );
                }

                return (
                  <SidebarMenuItem key={item.path}>
                    <Link to={item.path}>
                      <SidebarMenuButton
                        className={`w-full ${isPathActive(item.path) ? 'bg-sidebar-primary text-sidebar-primary-foreground' : 'hover:bg-sidebar-accent'}`}
                      >
                        <item.icon className="h-4 w-4" />
                        <span className="flex-1">{item.title}</span>
                        {item.path === '/inventory' && (alertData?.count ?? 0) > 0 && (
                          <span className="ml-auto rounded-full bg-destructive px-1.5 py-0.5 text-xs leading-none text-destructive-foreground">
                            {alertData!.count}
                          </span>
                        )}
                      </SidebarMenuButton>
                    </Link>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border p-4">
        <div className="mb-3 flex items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-sidebar-accent">
            {profile?.profilePictureUrl ? (
              <img src={profile.profilePictureUrl} alt="Profile" className="h-full w-full object-cover" />
            ) : (
              <span className="text-xs font-bold text-sidebar-foreground">
                {profile?.fullName
                  ? profile.fullName.split(' ').map((part: string) => part[0]).slice(0, 2).join('').toUpperCase()
                  : (user?.email?.[0] ?? 'U').toUpperCase()}
              </span>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium capitalize text-sidebar-foreground">
              {profile?.role?.replace(/_/g, ' ') ?? user?.email?.split('@')[0] ?? ''}
            </p>
            <p className="truncate text-xs text-sidebar-foreground/60">
              {profile?.employee?.jobTitle ?? (customerRole ? 'Customer' : 'Staff')}
            </p>
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={signOut}
          className="w-full justify-start text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground"
        >
          <LogOut className="mr-2 h-4 w-4" />
          Sign Out
        </Button>
      </SidebarFooter>
    </Sidebar>
  );
}
