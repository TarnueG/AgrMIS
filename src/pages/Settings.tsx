import { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import api from '@/lib/api';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { useTheme } from '@/hooks/useTheme';
import {
  User, Edit2, LogOut, Sun, Moon, Shield, Check,
  Camera, Briefcase, Building2, Calendar, Mail, Hash,
} from 'lucide-react';

// ─── Settings (User Profile) ─────────────────────────────────────────────────

export function Settings() {
  const { toast } = useToast();
  const { signOut } = useAuth();
  const { theme, setTheme } = useTheme();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [editOpen, setEditOpen] = useState(false);
  const [editUsername, setEditUsername] = useState('');

  const { data: profile, isLoading } = useQuery({
    queryKey: ['user-profile'],
    queryFn: () => api.get<any>('/profile'),
  });

  const updateProfile = useMutation({
    mutationFn: (data: { username: string }) => api.patch('/profile', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user-profile'] });
      toast({ title: 'Profile updated' });
      setEditOpen(false);
    },
    onError: (e: any) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  const uploadPicture = useMutation({
    mutationFn: (file: File) => {
      const form = new FormData();
      form.append('picture', file);
      return api.post<any>('/profile/picture', form);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user-profile'] });
      toast({ title: 'Profile picture updated' });
    },
    onError: (e: any) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  const initials = profile?.fullName
    ? profile.fullName.split(' ').map((p: string) => p[0]).slice(0, 2).join('').toUpperCase()
    : '?';

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      toast({ title: 'File too large', description: 'Maximum file size is 5MB', variant: 'destructive' });
      return;
    }
    uploadPicture.mutate(file);
    e.target.value = '';
  };

  const openEdit = () => {
    setEditUsername(profile?.username ?? '');
    setEditOpen(true);
  };

  const handleLogout = () => {
    if (confirm('Sign out of AMIS?')) {
      signOut();
      navigate('/auth');
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in max-w-2xl">
        <div>
          <h1 className="text-3xl font-bold">Settings</h1>
          <p className="text-muted-foreground">Manage your profile and preferences</p>
        </div>

        {/* Profile Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><User className="h-5 w-5" /> User Profile</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {isLoading ? (
              <div className="text-center text-muted-foreground py-8">Loading…</div>
            ) : (
              <>
                {/* Avatar */}
                <div className="flex flex-col items-center gap-3">
                  <div className="relative">
                    <div className="h-24 w-24 rounded-full overflow-hidden border-4 border-border bg-sidebar-accent flex items-center justify-center">
                      {profile?.profilePictureUrl ? (
                        <img src={profile.profilePictureUrl} alt="Profile" className="h-full w-full object-cover" />
                      ) : (
                        <span className="text-3xl font-bold text-foreground">{initials}</span>
                      )}
                    </div>
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      disabled={uploadPicture.isPending}
                      className="absolute bottom-0 right-0 h-8 w-8 rounded-full gradient-primary text-black flex items-center justify-center hover:opacity-90 transition-opacity"
                      title="Change profile picture"
                    >
                      <Camera className="h-4 w-4" />
                    </button>
                    <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
                  </div>
                  <div className="text-center">
                    <p className="text-xl font-bold">@{profile?.username}</p>
                    <p className="text-sm text-muted-foreground">{profile?.fullName}</p>
                  </div>
                </div>

                {/* Profile Info */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="flex items-start gap-3 p-3 rounded-lg bg-card border border-border">
                    <Mail className="h-4 w-4 text-muted-foreground mt-0.5" />
                    <div>
                      <p className="text-xs text-muted-foreground">Email</p>
                      <p className="text-sm font-medium">{profile?.email}</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3 p-3 rounded-lg bg-card border border-border">
                    <Shield className="h-4 w-4 text-muted-foreground mt-0.5" />
                    <div>
                      <p className="text-xs text-muted-foreground">System Role</p>
                      <p className="text-sm font-medium capitalize">{profile?.role}</p>
                    </div>
                  </div>
                  {profile?.employee?.jobTitle && (
                    <div className="flex items-start gap-3 p-3 rounded-lg bg-card border border-border">
                      <Briefcase className="h-4 w-4 text-muted-foreground mt-0.5" />
                      <div>
                        <p className="text-xs text-muted-foreground">Job Title</p>
                        <p className="text-sm font-medium">{profile.employee.jobTitle}</p>
                      </div>
                    </div>
                  )}
                  {profile?.employee?.department && (
                    <div className="flex items-start gap-3 p-3 rounded-lg bg-card border border-border">
                      <Building2 className="h-4 w-4 text-muted-foreground mt-0.5" />
                      <div>
                        <p className="text-xs text-muted-foreground">Department</p>
                        <p className="text-sm font-medium">{profile.employee.department}</p>
                      </div>
                    </div>
                  )}
                  {profile?.employee?.personnelId && (
                    <div className="flex items-start gap-3 p-3 rounded-lg bg-card border border-border">
                      <Hash className="h-4 w-4 text-muted-foreground mt-0.5" />
                      <div>
                        <p className="text-xs text-muted-foreground">Personnel ID</p>
                        <p className="text-sm font-medium font-mono">{profile.employee.personnelId}</p>
                      </div>
                    </div>
                  )}
                  {profile?.employee?.dateHired && (
                    <div className="flex items-start gap-3 p-3 rounded-lg bg-card border border-border">
                      <Calendar className="h-4 w-4 text-muted-foreground mt-0.5" />
                      <div>
                        <p className="text-xs text-muted-foreground">Date Hired</p>
                        <p className="text-sm font-medium">
                          {new Date(profile.employee.dateHired).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
                        </p>
                      </div>
                    </div>
                  )}
                </div>

                <Button onClick={openEdit} className="border border-input bg-background text-white hover:bg-accent hover:text-accent-foreground">
                  <Edit2 className="h-4 w-4 mr-2" />
                  Edit User Profile
                </Button>
              </>
            )}
          </CardContent>
        </Card>

        {/* Theme Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {theme === 'dark' ? <Moon className="h-5 w-5" /> : <Sun className="h-5 w-5" />}
              Theme
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => setTheme('dark')}
                className={`relative p-4 rounded-lg border-2 transition-all text-left ${theme === 'dark' ? 'border-primary bg-primary/10' : 'border-border bg-card hover:border-border/80'}`}
              >
                {theme === 'dark' && (
                  <div className="absolute top-2 right-2 h-5 w-5 rounded-full gradient-primary flex items-center justify-center">
                    <Check className="h-3 w-3 text-black" />
                  </div>
                )}
                <Moon className="h-6 w-6 mb-2 text-muted-foreground" />
                <p className="font-medium">Dark Theme</p>
                <p className="text-xs text-muted-foreground">Current default</p>
              </button>
              <button
                onClick={() => setTheme('light')}
                className={`relative p-4 rounded-lg border-2 transition-all text-left ${theme === 'light' ? 'border-primary bg-primary/10' : 'border-border bg-card hover:border-border/80'}`}
              >
                {theme === 'light' && (
                  <div className="absolute top-2 right-2 h-5 w-5 rounded-full gradient-primary flex items-center justify-center">
                    <Check className="h-3 w-3 text-black" />
                  </div>
                )}
                <Sun className="h-6 w-6 mb-2 text-muted-foreground" />
                <p className="font-medium">Light Theme</p>
                <p className="text-xs text-muted-foreground">Light mode</p>
              </button>
            </div>
          </CardContent>
        </Card>

        {/* Logout Card */}
        <Card>
          <CardContent className="pt-6">
            <Button
              variant="destructive"
              onClick={handleLogout}
              className="w-full sm:w-auto"
            >
              <LogOut className="h-4 w-4 mr-2" />
              Sign Out
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Edit Profile Dialog */}
      <Dialog open={editOpen} onOpenChange={(o) => { setEditOpen(o); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit User Profile</DialogTitle>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!editUsername.trim()) return;
              updateProfile.mutate({ username: editUsername.trim().toLowerCase() });
            }}
            className="space-y-4"
          >
            <div className="space-y-2">
              <Label>Username</Label>
              <Input
                value={editUsername}
                onChange={(e) => setEditUsername(e.target.value)}
                placeholder="e.g. johnd"
                pattern="[a-z0-9_]+"
                title="Lowercase letters, numbers, or underscores"
                required
                className="text-white placeholder:text-white/50"
              />
              <p className="text-xs text-muted-foreground">Lowercase letters, numbers, and underscores only</p>
            </div>
            <div className="flex gap-2">
              <Button type="submit" className="gradient-primary text-black font-medium" disabled={updateProfile.isPending}>
                Save Changes
              </Button>
              <Button type="button" onClick={() => setEditOpen(false)} className="border border-input bg-background text-white hover:bg-accent hover:text-accent-foreground">
                Cancel
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}

// ─── Access Control ───────────────────────────────────────────────────────────

const SUBSYSTEM_LABELS: Record<string, string> = {
  dashboard: 'Dashboard',
  inventory: 'Inventory',
  procurement: 'Procurement',
  crm: 'CRM (Customers)',
  marketing: 'Marketing',
  sales_order_points: 'Sales & Order Points',
  production: 'Production',
  livestock: 'Livestock',
  finance: 'Finance',
  reports: 'Reports',
  human_capital: 'Human Capital',
  machinery: 'Machinery',
  land_parcels: 'Land Parcels',
  settings: 'Settings & Access Control',
};

const SUBSYSTEM_KEYS = Object.keys(SUBSYSTEM_LABELS);

type Permission = { farm_id: string; role_id: string; subsystem: string; can_view: boolean; can_create: boolean; can_edit: boolean; can_delete: boolean };

function getPermission(permissions: Permission[], roleId: string, subsystem: string): Permission | undefined {
  return permissions.find(p => p.role_id === roleId && p.subsystem === subsystem);
}

export function AccessControl() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [roleFilter, setRoleFilter] = useState('');
  const [roleDialogOpen, setRoleDialogOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<any>(null);
  const [newRoleId, setNewRoleId] = useState('');

  const { data: acData } = useQuery({
    queryKey: ['access-control-subsystems'],
    queryFn: () => api.get<any>('/access-control/subsystems'),
  });

  const { data: usersData } = useQuery({
    queryKey: ['access-control-users'],
    queryFn: () => api.get<any>('/access-control/users'),
  });

  const updatePermission = useMutation({
    mutationFn: (data: { roleId: string; subsystem: string; canView: boolean; canCreate: boolean; canEdit: boolean; canDelete: boolean }) =>
      api.put('/access-control/subsystems', data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['access-control-subsystems'] }),
    onError: (e: any) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  const updateRole = useMutation({
    mutationFn: ({ userId, roleId }: { userId: string; roleId: string }) =>
      api.patch(`/access-control/users/${userId}/role`, { roleId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['access-control-users'] });
      toast({ title: 'Role updated' });
      setRoleDialogOpen(false);
    },
    onError: (e: any) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  const roles: any[] = acData?.roles ?? [];
  const permissions: Permission[] = acData?.permissions ?? [];
  const users: any[] = usersData?.users ?? [];
  const allRoles: any[] = usersData?.roles ?? roles;

  const filteredRoles = roleFilter ? roles.filter((r: any) => r.id === roleFilter) : roles;

  const handlePermToggle = (roleId: string, subsystem: string, field: 'can_view' | 'can_create' | 'can_edit' | 'can_delete') => {
    const current = getPermission(permissions, roleId, subsystem);
    const base = { canView: true, canCreate: false, canEdit: false, canDelete: false };
    if (current) {
      base.canView = current.can_view;
      base.canCreate = current.can_create;
      base.canEdit = current.can_edit;
      base.canDelete = current.can_delete;
    }
    const fieldMap: Record<string, keyof typeof base> = {
      can_view: 'canView', can_create: 'canCreate', can_edit: 'canEdit', can_delete: 'canDelete',
    };
    const key = fieldMap[field];
    (base as any)[key] = !(base as any)[key];
    updatePermission.mutate({ roleId, subsystem, ...base });
  };

  const openRoleDialog = (u: any) => {
    setSelectedUser(u);
    setNewRoleId(u.role?.id ?? '');
    setRoleDialogOpen(true);
  };

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in">
        <div>
          <h1 className="text-3xl font-bold">Access Control</h1>
          <p className="text-muted-foreground">Manage roles, permissions, and subsystem access</p>
        </div>

        {/* Role Filter */}
        <div className="flex items-center gap-3">
          <Label className="text-sm text-muted-foreground whitespace-nowrap">Filter by role:</Label>
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            className="h-10 rounded-md border border-input bg-background px-3 text-sm text-foreground"
          >
            <option value="">All Roles</option>
            {roles.map((r: any) => (
              <option key={r.id} value={r.id}>{r.name}</option>
            ))}
          </select>
        </div>

        {/* Subsystem Permission Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {SUBSYSTEM_KEYS.map((subsystem) => (
            <Card key={subsystem} className="border border-border">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Shield className="h-4 w-4 text-primary" />
                  {SUBSYSTEM_LABELS[subsystem]}
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs py-2 pl-4">Role</TableHead>
                      <TableHead className="text-xs py-2 text-center">View</TableHead>
                      <TableHead className="text-xs py-2 text-center">Create</TableHead>
                      <TableHead className="text-xs py-2 text-center">Edit</TableHead>
                      <TableHead className="text-xs py-2 text-center pr-4">Delete</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredRoles.map((role: any) => {
                      const perm = getPermission(permissions, role.id, subsystem);
                      const canView = perm ? perm.can_view : true;
                      const canCreate = perm ? perm.can_create : false;
                      const canEdit = perm ? perm.can_edit : false;
                      const canDelete = perm ? perm.can_delete : false;
                      return (
                        <TableRow key={role.id}>
                          <TableCell className="text-xs py-2 pl-4 font-medium capitalize">{role.name.replace(/_/g, ' ')}</TableCell>
                          {(['can_view', 'can_create', 'can_edit', 'can_delete'] as const).map((field, idx) => {
                            const val = [canView, canCreate, canEdit, canDelete][idx];
                            return (
                              <TableCell key={field} className={`py-2 text-center ${idx === 3 ? 'pr-4' : ''}`}>
                                <button
                                  onClick={() => handlePermToggle(role.id, subsystem, field)}
                                  className={`h-5 w-5 rounded border-2 flex items-center justify-center mx-auto transition-colors ${val ? 'gradient-primary border-primary' : 'border-border bg-background hover:border-primary/50'}`}
                                >
                                  {val && <Check className="h-3 w-3 text-black" />}
                                </button>
                              </TableCell>
                            );
                          })}
                        </TableRow>
                      );
                    })}
                    {filteredRoles.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center text-xs py-4 text-muted-foreground">No roles</TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* User Role Management */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="h-5 w-5" />
              User Role Management
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Full Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Job Title</TableHead>
                  <TableHead>Current Role</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((u: any) => (
                  <TableRow key={u.id}>
                    <TableCell className="font-medium">{u.fullName}</TableCell>
                    <TableCell className="text-muted-foreground text-sm">{u.email}</TableCell>
                    <TableCell className="text-sm">{u.employee?.job_title ?? '—'}</TableCell>
                    <TableCell>
                      <span className="px-2 py-0.5 rounded-full text-xs bg-primary/20 text-primary capitalize">
                        {u.role?.name?.replace(/_/g, ' ') ?? '—'}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="sm"
                        onClick={() => openRoleDialog(u)}
                        className="border border-input bg-background text-white hover:bg-accent hover:text-accent-foreground h-7 text-xs"
                      >
                        Change Role
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {!users.length && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">No users found</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      {/* Change Role Dialog */}
      <Dialog open={roleDialogOpen} onOpenChange={(o) => { setRoleDialogOpen(o); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Change Role — {selectedUser?.fullName}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Assign Role</Label>
              <select
                value={newRoleId}
                onChange={(e) => setNewRoleId(e.target.value)}
                className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm text-foreground"
              >
                <option value="">Select role</option>
                {allRoles.map((r: any) => (
                  <option key={r.id} value={r.id}>{r.name.replace(/_/g, ' ')}</option>
                ))}
              </select>
            </div>
            <div className="flex gap-2">
              <Button
                onClick={() => {
                  if (!newRoleId) return;
                  if (confirm(`Assign role to ${selectedUser?.fullName}?`)) {
                    updateRole.mutate({ userId: selectedUser.id, roleId: newRoleId });
                  }
                }}
                disabled={updateRole.isPending || !newRoleId}
                className="gradient-primary text-black font-medium"
              >
                Save
              </Button>
              <Button
                onClick={() => setRoleDialogOpen(false)}
                className="border border-input bg-background text-white hover:bg-accent hover:text-accent-foreground"
              >
                Cancel
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
