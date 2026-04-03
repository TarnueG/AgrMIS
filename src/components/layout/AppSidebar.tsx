import { Link, useLocation } from 'react-router-dom';
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
import { Button } from '@/components/ui/button';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { useState } from 'react';

const menuItems = [
  {
    title: 'Dashboard',
    icon: LayoutDashboard,
    path: '/dashboard',
  },
  {
    title: 'Asset Management',
    icon: Tractor,
    items: [
      { title: 'Land Parcels', path: '/assets/land', icon: Wheat },
      { title: 'Machinery', path: '/assets/machinery', icon: Tractor },
      { title: 'Livestock', path: '/assets/livestock', icon: Leaf },
    ],
  },
  {
    title: 'Inventory',
    icon: Package,
    path: '/inventory',
  },
  {
    title: 'Procurement',
    icon: Truck,
    path: '/procurement',
  },
  {
    title: 'CRM',
    icon: Users,
    path: '/customers',
  },
  {
    title: 'Sales & Orders',
    icon: ShoppingCart,
    path: '/orders',
  },
  {
    title: 'Production',
    icon: Factory,
    path: '/production',
  },
  {
    title: 'Finance',
    icon: DollarSign,
    path: '/finance',
  },
  {
    title: 'Reports',
    icon: BarChart3,
    path: '/reports',
  },
  {
    title: 'Human Capital',
    icon: UserCog,
    path: '/employees',
  },
  {
    title: 'Administration',
    icon: Shield,
    items: [
      { title: 'Settings', path: '/settings', icon: Settings },
      { title: 'Access Control', path: '/access-control', icon: Shield },
    ],
  },
];

export function AppSidebar() {
  const location = useLocation();
  const { signOut, user } = useAuth();
  const [openGroups, setOpenGroups] = useState<string[]>(['Asset Management']);

  const toggleGroup = (title: string) => {
    setOpenGroups(prev =>
      prev.includes(title) ? prev.filter(g => g !== title) : [...prev, title]
    );
  };

  const isActive = (path: string) => location.pathname === path;

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

      <SidebarContent className="px-2 py-4">
        <SidebarGroup>
          <SidebarGroupLabel className="text-sidebar-foreground/50 text-xs uppercase tracking-wider mb-2">
            Main Menu
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {menuItems.map((item) =>
                item.items ? (
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
                  <SidebarMenuItem key={item.path}>
                    <Link to={item.path}>
                      <SidebarMenuButton
                        className={`w-full ${
                          isActive(item.path)
                            ? 'bg-sidebar-primary text-sidebar-primary-foreground'
                            : 'hover:bg-sidebar-accent'
                        }`}
                      >
                        <item.icon className="h-4 w-4" />
                        {item.title}
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
          <div className="h-9 w-9 rounded-full bg-sidebar-accent flex items-center justify-center">
            <Users className="h-4 w-4 text-sidebar-foreground" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-sidebar-foreground truncate">
              {user?.email?.split('@')[0]}
            </p>
            <p className="text-xs text-sidebar-foreground/60">Staff</p>
          </div>
        </div>
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
