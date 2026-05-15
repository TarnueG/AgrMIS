import { useState, useRef, useCallback, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api, { getAccessToken } from '@/lib/api';
import { CARD_REGISTRY, CardDef } from '@/lib/cardRegistry';
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
import { usePermissions } from '@/hooks/usePermissions';
import {
  User, Edit2, LogOut, Sun, Moon, Shield, Check,
  Camera, Briefcase, Building2, Calendar, Mail, Hash,
  Users, ClipboardList, ChevronLeft, ChevronRight,
  Download, Search, Filter, UserPlus, Copy, Eye, EyeOff, Key,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

type Panel = 'profile' | 'theme' | 'change-password' | 'list-users' | 'audit-log' | 'access-control';

const EVENT_TYPE_COLORS: Record<string, string> = {
  login_success: 'bg-green-500/20 text-green-400',
  login_failed: 'bg-red-500/20 text-red-400',
  logout: 'bg-gray-500/20 text-gray-400',
  profile_updated: 'bg-blue-500/20 text-blue-400',
  profile_picture_updated: 'bg-blue-500/20 text-blue-400',
  permission_changed: 'bg-yellow-500/20 text-yellow-400',
  role_changed: 'bg-purple-500/20 text-purple-400',
  settings_changed: 'bg-blue-500/20 text-blue-400',
  failed_authorization: 'bg-red-500/20 text-red-400',
  account_created: 'bg-teal-500/20 text-teal-400',
};

const EVENT_TYPE_LABELS: Record<string, string> = {
  login_success: 'Login',
  login_failed: 'Failed Login',
  logout: 'Logout',
  profile_updated: 'Profile Update',
  profile_picture_updated: 'Picture Update',
  permission_changed: 'Permission Change',
  role_changed: 'Role Change',
  settings_changed: 'Settings Change',
  failed_authorization: 'Access Denied',
  account_created: 'Account Created',
};

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

// ─── Profile Panel ────────────────────────────────────────────────────────────

function ProfilePanel() {
  const { toast } = useToast();
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

  return (
    <div className="space-y-6 max-w-2xl animate-fade-in">
      <div>
        <h2 className="text-2xl font-bold">User Profile</h2>
        <p className="text-muted-foreground">Manage your profile information</p>
      </div>

      <Card>
        <CardContent className="pt-6 space-y-6">
          {isLoading ? (
            <div className="text-center text-muted-foreground py-8">Loading…</div>
          ) : (
            <>
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
                  <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={handleFileChange} />
                </div>
                <div className="text-center">
                  <p className="text-xl font-bold">@{profile?.username}</p>
                  <p className="text-sm text-muted-foreground">{profile?.fullName}</p>
                </div>
              </div>

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

              <Button onClick={() => { setEditUsername(profile?.username ?? ''); setEditOpen(true); }} className="border border-input bg-background text-white hover:bg-accent hover:text-accent-foreground">
                <Edit2 className="h-4 w-4 mr-2" />
                Edit User Profile
              </Button>
            </>
          )}
        </CardContent>
      </Card>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
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
    </div>
  );
}

// ─── Theme Panel ──────────────────────────────────────────────────────────────

function ThemePanel() {
  const { theme, setTheme } = useTheme();
  return (
    <div className="space-y-6 max-w-2xl animate-fade-in">
      <div>
        <h2 className="text-2xl font-bold">Theme</h2>
        <p className="text-muted-foreground">Choose your preferred appearance</p>
      </div>
      <Card>
        <CardContent className="pt-6">
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
    </div>
  );
}

// ─── Users Panel ──────────────────────────────────────────────────────────────

function UsersPanel({ onViewAuditLog }: { onViewAuditLog: (userId: string) => void }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user: currentUser } = useAuth();
  const [search, setSearch] = useState('');
  const [selectedUser, setSelectedUser] = useState<any>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedPerson, setSelectedPerson] = useState<any>(null);
  const [createRoleId, setCreateRoleId] = useState('');
  const [roleDialogOpen, setRoleDialogOpen] = useState(false);
  const [createdCreds, setCreatedCreds] = useState<{ username: string; password: string; fullName: string } | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  const { data: usersData } = useQuery({
    queryKey: ['ac-users-list'],
    queryFn: () => api.get<any>('/access-control/users'),
  });

  const { data: eligibleData } = useQuery({
    queryKey: ['eligible-personnel'],
    queryFn: () => api.get<any>('/access-control/eligible-personnel'),
    enabled: createOpen,
  });

  const createAccount = useMutation({
    mutationFn: (data: any) => api.post<any>('/access-control/create-account', data),
    onSuccess: (data: any) => {
      setCreatedCreds({ username: data.username, password: data.generatedPassword, fullName: data.fullName });
      setRoleDialogOpen(false);
      setSelectedPerson(null);
      setCreateRoleId('');
      queryClient.invalidateQueries({ queryKey: ['ac-users-list'] });
      queryClient.invalidateQueries({ queryKey: ['eligible-personnel'] });
    },
    onError: (e: any) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  const toggleActive = useMutation({
    mutationFn: ({ id, activate }: { id: string; activate: boolean }) =>
      api.patch(`/access-control/users/${id}/${activate ? 'activate' : 'deactivate'}`, {}),
    onSuccess: (_d, vars) => {
      queryClient.invalidateQueries({ queryKey: ['ac-users-list'] });
      toast({ title: vars.activate ? 'User activated' : 'User deactivated' });
    },
    onError: (e: any) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  const users: any[] = usersData?.users ?? [];
  const roles: any[] = usersData?.roles ?? [];
  const eligiblePersonnel: any[] = eligibleData?.personnel ?? [];

  const filtered = users.filter((u) => {
    const q = search.toLowerCase();
    return !q ||
      u.fullName?.toLowerCase().includes(q) ||
      u.email?.toLowerCase().includes(q) ||
      u.username?.toLowerCase().includes(q) ||
      u.role?.name?.toLowerCase().includes(q) ||
      u.employee?.job_title?.toLowerCase().includes(q);
  });

  const initials = (name: string) =>
    name?.split(' ').map((p: string) => p[0]).slice(0, 2).join('').toUpperCase() ?? '?';

  const roleColor = (roleName: string) => {
    const n = roleName?.toLowerCase() ?? '';
    if (n.includes('admin')) return 'bg-red-500/20 text-red-400';
    if (n.includes('supervisor')) return 'bg-purple-500/20 text-purple-400';
    if (n.includes('manager')) return 'bg-blue-500/20 text-blue-400';
    return 'bg-teal-500/20 text-teal-400';
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: 'Copied to clipboard' });
  };

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Users</h2>
          <p className="text-muted-foreground">Browse and manage system user accounts</p>
        </div>
        <Button onClick={() => setCreateOpen(true)} className="gradient-primary text-black font-medium">
          <UserPlus className="h-4 w-4 mr-2" />
          Create Users
        </Button>
      </div>

      <div className="relative max-w-xs">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onBlur={() => setSearch('')}
          placeholder="Search users..."
          className="pl-9 text-white placeholder:text-white/50"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* User list */}
        <div className="lg:col-span-2">
          <Card className="border border-border">
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>User</TableHead>
                    <TableHead>Job Title</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead className="text-center">Active</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((u) => (
                    <TableRow
                      key={u.id}
                      className={`cursor-pointer transition-colors ${selectedUser?.id === u.id ? 'bg-accent' : 'hover:bg-accent/50'}`}
                      onClick={() => setSelectedUser(u)}
                    >
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <div className="h-8 w-8 rounded-full bg-sidebar-accent flex items-center justify-center text-xs font-bold shrink-0">
                            {initials(u.fullName)}
                          </div>
                          <div>
                            <p className="font-medium text-sm">{u.fullName}</p>
                            <p className="text-xs text-muted-foreground">@{u.username ?? '—'}</p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{u.employee?.job_title ?? '—'}</TableCell>
                      <TableCell>
                        <span className={`px-2 py-0.5 rounded-full text-xs ${roleColor(u.role?.name ?? '')}`}>
                          {u.role?.name?.replace(/_/g, ' ') ?? '—'}
                        </span>
                      </TableCell>
                      <TableCell className="text-center" onClick={e => e.stopPropagation()}>
                        {u.id !== currentUser?.id && (
                          <button
                            onClick={() => {
                              const isActive = u.isActive !== false;
                              const msg = isActive
                                ? `Deactivate ${u.fullName}? They will be logged out immediately.`
                                : `Reactivate ${u.fullName}?`;
                              if (confirm(msg)) toggleActive.mutate({ id: u.id, activate: !isActive });
                            }}
                            className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${u.isActive !== false ? 'bg-primary' : 'bg-border'}`}
                          >
                            <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform ${u.isActive !== false ? 'translate-x-4' : 'translate-x-1'}`} />
                          </button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                  {!filtered.length && (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">No users found</TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>

        {/* Detail panel */}
        <div>
          {selectedUser ? (
            <Card className="border border-border">
              <CardHeader className="pb-3">
                <div className="flex flex-col items-center gap-2 text-center">
                  <div className="h-14 w-14 rounded-full bg-sidebar-accent flex items-center justify-center text-lg font-bold">
                    {initials(selectedUser.fullName)}
                  </div>
                  <div>
                    <p className="font-semibold">{selectedUser.fullName}</p>
                    <p className="text-xs text-muted-foreground">@{selectedUser.username ?? '—'}</p>
                    <span className={`mt-1 inline-block px-2 py-0.5 rounded-full text-xs ${roleColor(selectedUser.role?.name ?? '')}`}>
                      {selectedUser.role?.name?.replace(/_/g, ' ') ?? '—'}
                    </span>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Mail className="h-3 w-3" />
                  <span className="truncate">{selectedUser.email}</span>
                </div>
                {selectedUser.employee?.job_title && (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Briefcase className="h-3 w-3" />
                    <span>{selectedUser.employee.job_title}</span>
                  </div>
                )}
                {selectedUser.employee?.department && (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Building2 className="h-3 w-3" />
                    <span>{selectedUser.employee.department}</span>
                  </div>
                )}
                {selectedUser.employee?.personnel_id && (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Hash className="h-3 w-3" />
                    <span className="font-mono">{selectedUser.employee.personnel_id}</span>
                  </div>
                )}
                <div className="pt-2">
                  <Button
                    size="sm"
                    onClick={() => onViewAuditLog(selectedUser.id)}
                    className="w-full border border-input bg-background text-white hover:bg-accent hover:text-accent-foreground text-xs"
                  >
                    <ClipboardList className="h-3 w-3 mr-1" />
                    View Audit Log
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card className="border border-border border-dashed">
              <CardContent className="pt-10 pb-10 text-center text-muted-foreground text-sm">
                <User className="h-8 w-8 mx-auto mb-2 opacity-30" />
                Select a user to view details
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* ── Create Users Dialog ────────────────────────────────── */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Create Users</DialogTitle>
            <p className="text-sm text-muted-foreground">Active personnel and customers without accounts</p>
          </DialogHeader>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>ID</TableHead>
                <TableHead>Full Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Job Title</TableHead>
                <TableHead>Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {eligiblePersonnel.map((p) => (
                <TableRow key={p.sourceId}>
                  <TableCell className="font-mono text-xs">{p.displayId}</TableCell>
                  <TableCell className="font-medium">{p.fullName}</TableCell>
                  <TableCell className="text-sm">{p.email}</TableCell>
                  <TableCell className="text-sm capitalize">{p.jobTitle}</TableCell>
                  <TableCell>
                    <Button
                      size="sm"
                      className="gradient-primary text-black font-medium text-xs"
                      onClick={() => {
                        setSelectedPerson(p);
                        setCreateRoleId(roles[0]?.id ?? '');
                        setRoleDialogOpen(true);
                      }}
                    >
                      Create Account
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {!eligiblePersonnel.length && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                    All active personnel and customers already have accounts
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </DialogContent>
      </Dialog>

      {/* ── Role Selection Dialog ──────────────────────────────── */}
      <Dialog open={roleDialogOpen} onOpenChange={setRoleDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Assign Role — {selectedPerson?.fullName}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="p-3 rounded-lg bg-card border border-border space-y-1 text-sm">
              <p><span className="text-muted-foreground">Email: </span>{selectedPerson?.email}</p>
              <p><span className="text-muted-foreground">Job Title: </span>{selectedPerson?.jobTitle}</p>
            </div>
            <div className="space-y-2">
              <Label>Role</Label>
              <select
                value={createRoleId}
                onChange={(e) => setCreateRoleId(e.target.value)}
                className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm text-foreground"
              >
                <option value="">Select role</option>
                {roles.map((r: any) => (
                  <option key={r.id} value={r.id}>{r.name.replace(/_/g, ' ')}</option>
                ))}
              </select>
            </div>
            <p className="text-xs text-muted-foreground">
              A username and temporary password will be auto-generated. The user can change both after first login.
            </p>
            <div className="flex gap-2">
              <Button
                className="gradient-primary text-black font-medium"
                disabled={!createRoleId || createAccount.isPending}
                onClick={() => {
                  if (!selectedPerson || !createRoleId) return;
                  createAccount.mutate({
                    sourceType: selectedPerson.type,
                    sourceId: selectedPerson.sourceId,
                    roleId: createRoleId,
                    fullName: selectedPerson.fullName,
                    email: selectedPerson.email,
                    jobTitle: selectedPerson.jobTitle,
                    phone: selectedPerson.phone,
                    address: selectedPerson.address,
                  });
                }}
              >
                {createAccount.isPending ? 'Creating…' : 'Create Account'}
              </Button>
              <Button onClick={() => setRoleDialogOpen(false)} className="border border-input bg-background text-white hover:bg-accent hover:text-accent-foreground">
                Cancel
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Credentials Dialog ─────────────────────────────────── */}
      <Dialog open={!!createdCreds} onOpenChange={() => { setCreatedCreds(null); setShowPassword(false); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Account Created</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Account created for <strong>{createdCreds?.fullName}</strong>. Share these credentials securely.
            </p>
            <div className="p-4 rounded-lg bg-card border border-border space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">Username</p>
                  <p className="font-mono font-medium">{createdCreds?.username}</p>
                </div>
                <Button size="icon" variant="ghost" onClick={() => copyToClipboard(createdCreds?.username ?? '')}>
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <p className="text-xs text-muted-foreground">Temporary Password</p>
                  <p className="font-mono font-medium">
                    {showPassword ? createdCreds?.password : '••••••••••••'}
                  </p>
                </div>
                <div className="flex gap-1">
                  <Button size="icon" variant="ghost" onClick={() => setShowPassword(p => !p)}>
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                  <Button size="icon" variant="ghost" onClick={() => copyToClipboard(createdCreds?.password ?? '')}>
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <Key className="h-3 w-3" />
              User should change this password after first login.
            </p>
            <Button
              onClick={() => { setCreatedCreds(null); setShowPassword(false); }}
              className="w-full border border-input bg-background text-white hover:bg-accent hover:text-accent-foreground"
            >
              Done
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Audit Log Panel ──────────────────────────────────────────────────────────

function AuditLogPanel({ prefilterUserId }: { prefilterUserId?: string }) {
  const { toast } = useToast();
  const [eventType, setEventType] = useState('all');
  const [subsystem, setSubsystem] = useState('all');
  const [dateRange, setDateRange] = useState('last30');
  const [page, setPage] = useState(1);
  const LIMIT = 50;

  const params = new URLSearchParams({ eventType, subsystem, dateRange, page: String(page), limit: String(LIMIT) });

  const { data, isLoading } = useQuery({
    queryKey: ['audit-log', eventType, subsystem, dateRange, page],
    queryFn: () => api.get<any>(`/audit-log?${params}`),
  });

  const events: any[] = data?.events ?? [];
  const total: number = data?.total ?? 0;
  const totalPages = Math.ceil(total / LIMIT);

  const handleExportCSV = useCallback(async () => {
    try {
      const token = getAccessToken();
      const exportParams = new URLSearchParams({ eventType, subsystem, dateRange, format: 'csv' });
      const res = await fetch(`/api/v1/audit-log?${exportParams}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error('Export failed');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'audit-log.csv';
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast({ title: 'Export failed', variant: 'destructive' });
    }
  }, [eventType, subsystem, dateRange, toast]);

  const formatTime = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  const parseBrowser = (ua: string | null) => {
    if (!ua) return '—';
    if (ua.includes('Chrome')) return 'Chrome';
    if (ua.includes('Firefox')) return 'Firefox';
    if (ua.includes('Safari')) return 'Safari';
    if (ua.includes('Edge')) return 'Edge';
    return 'Browser';
  };

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Audit Log</h2>
          <p className="text-muted-foreground">System activity and security events</p>
        </div>
        <Button onClick={handleExportCSV} className="border border-input bg-background text-white hover:bg-accent hover:text-accent-foreground">
          <Download className="h-4 w-4 mr-2" />
          Export CSV
        </Button>
      </div>

      <div className="flex flex-wrap gap-3 items-center">
        <Filter className="h-4 w-4 text-muted-foreground shrink-0" />
        <select
          value={eventType}
          onChange={(e) => { setEventType(e.target.value); setPage(1); }}
          className="h-9 rounded-md border border-input bg-background px-3 text-sm text-foreground"
        >
          <option value="all">All Events</option>
          <option value="login_success">Login</option>
          <option value="login_failed">Failed Login</option>
          <option value="logout">Logout</option>
          <option value="profile_updated">Profile Update</option>
          <option value="profile_picture_updated">Picture Update</option>
          <option value="permission_changed">Permission Change</option>
          <option value="role_changed">Role Change</option>
          <option value="account_created">Account Created</option>
          <option value="failed_authorization">Access Denied</option>
        </select>
        <select
          value={subsystem}
          onChange={(e) => { setSubsystem(e.target.value); setPage(1); }}
          className="h-9 rounded-md border border-input bg-background px-3 text-sm text-foreground"
        >
          <option value="all">All Subsystems</option>
          {Object.entries(SUBSYSTEM_LABELS).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
        <select
          value={dateRange}
          onChange={(e) => { setDateRange(e.target.value); setPage(1); }}
          className="h-9 rounded-md border border-input bg-background px-3 text-sm text-foreground"
        >
          <option value="last7">Last 7 days</option>
          <option value="last30">Last 30 days</option>
          <option value="last90">Last 90 days</option>
        </select>
      </div>

      <Card className="border border-border">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-40">Timestamp</TableHead>
                <TableHead>Actor</TableHead>
                <TableHead>Event</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Subsystem</TableHead>
                <TableHead>IP / Browser</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Loading…</TableCell>
                </TableRow>
              ) : events.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No events found</TableCell>
                </TableRow>
              ) : (
                events.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell className="text-xs text-muted-foreground whitespace-nowrap">{formatTime(e.occurredAt)}</TableCell>
                    <TableCell>
                      <div>
                        <p className="text-sm font-medium">{e.actor?.fullName ?? 'System'}</p>
                        {e.actor?.username && <p className="text-xs text-muted-foreground">@{e.actor.username}</p>}
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${EVENT_TYPE_COLORS[e.eventType] ?? 'bg-gray-500/20 text-gray-400'}`}>
                        {EVENT_TYPE_LABELS[e.eventType] ?? e.eventType}
                      </span>
                    </TableCell>
                    <TableCell className="text-sm max-w-xs truncate">{e.description ?? '—'}</TableCell>
                    <TableCell>
                      {e.subsystem ? (
                        <span className="px-2 py-0.5 rounded text-xs bg-accent text-accent-foreground">
                          {SUBSYSTEM_LABELS[e.subsystem] ?? e.subsystem}
                        </span>
                      ) : '—'}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {e.ipAddress ? `${e.ipAddress} · ${parseBrowser(e.userAgent)}` : '—'}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>{total} event{total !== 1 ? 's' : ''} · Retention: 365 days</span>
        {totalPages > 1 && (
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="border border-input bg-background text-white hover:bg-accent hover:text-accent-foreground h-7 px-2"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-xs">Page {page} of {totalPages}</span>
            <Button
              size="sm"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="border border-input bg-background text-white hover:bg-accent hover:text-accent-foreground h-7 px-2"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Access Control Content ───────────────────────────────────────────────────

const AC_SUBSYSTEM_LABELS: Record<string, string> = SUBSYSTEM_LABELS;
const AC_SUBSYSTEM_KEYS = Object.keys(AC_SUBSYSTEM_LABELS);

type Permission = { farm_id: string; role_id: string; subsystem: string; can_view: boolean; can_create: boolean; can_edit: boolean; can_delete: boolean };

function getPermission(permissions: Permission[], roleId: string, subsystem: string): Permission | undefined {
  return permissions.find((p) => p.role_id === roleId && p.subsystem === subsystem);
}

// ─── Change Password Panel ────────────────────────────────────────────────────

function ChangePasswordPanel() {
  const { toast } = useToast();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNext, setShowNext] = useState(false);

  const mutation = useMutation({
    mutationFn: (data: { currentPassword: string; newPassword: string }) =>
      api.post('/auth/change-password', data),
    onSuccess: () => {
      toast({ title: 'Password updated', description: 'Your password has been changed.' });
      setCurrent(''); setNext(''); setConfirm('');
    },
    onError: (e: any) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (next.length < 8) {
      toast({ title: 'Too short', description: 'New password must be at least 8 characters.', variant: 'destructive' });
      return;
    }
    if (next !== confirm) {
      toast({ title: 'Mismatch', description: 'New passwords do not match.', variant: 'destructive' });
      return;
    }
    mutation.mutate({ currentPassword: current, newPassword: next });
  };

  return (
    <div className="space-y-6 max-w-md animate-fade-in">
      <div>
        <h2 className="text-2xl font-bold">Change Password</h2>
        <p className="text-muted-foreground">Update your account password</p>
      </div>
      <Card>
        <CardContent className="pt-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label>Current Password</Label>
              <div className="relative">
                <Input
                  type={showCurrent ? 'text' : 'password'}
                  value={current}
                  onChange={e => setCurrent(e.target.value)}
                  placeholder="••••••••"
                  className="pr-10"
                />
                <button type="button" onClick={() => setShowCurrent(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                  {showCurrent ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            <div className="space-y-2">
              <Label>New Password</Label>
              <div className="relative">
                <Input
                  type={showNext ? 'text' : 'password'}
                  value={next}
                  onChange={e => setNext(e.target.value)}
                  placeholder="Min. 8 characters"
                  className="pr-10"
                />
                <button type="button" onClick={() => setShowNext(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                  {showNext ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Confirm New Password</Label>
              <Input
                type="password"
                value={confirm}
                onChange={e => setConfirm(e.target.value)}
                placeholder="Repeat new password"
              />
            </div>
            <Button type="submit" className="w-full gradient-primary text-black font-medium" disabled={mutation.isPending}>
              {mutation.isPending ? 'Updating…' : 'Update Password'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Card Access Components ───────────────────────────────────────────────────

function SubsystemCheckbox({ subsystem, cards, granted, onToggle }: {
  subsystem: string;
  cards: CardDef[];
  granted: Set<string>;
  onToggle: (subsystem: string, cards: CardDef[], check: boolean) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const cardIds = cards.map(c => `${subsystem}.${c.key}`);
  const checkedCount = cardIds.filter(id => granted.has(id)).length;
  const allChecked = checkedCount === cardIds.length;
  const someChecked = checkedCount > 0 && !allChecked;

  useEffect(() => {
    if (ref.current) ref.current.indeterminate = someChecked;
  }, [someChecked]);

  return (
    <input
      ref={ref}
      type="checkbox"
      checked={allChecked}
      onChange={() => onToggle(subsystem, cards, !allChecked)}
      className="h-4 w-4 rounded border-border accent-primary cursor-pointer shrink-0"
    />
  );
}

function CardAccessSection({ roleId, roleName }: { roleId: string; roleName: string }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [localGranted, setLocalGranted] = useState<Set<string> | null>(null);
  const [dirty, setDirty] = useState(false);

  const { data: cardData, isLoading } = useQuery({
    queryKey: ['access-control-cards', roleId],
    queryFn: () => api.get<any>(`/access-control/cards?roleId=${roleId}`),
  });

  useEffect(() => {
    if (cardData) {
      setLocalGranted(new Set(cardData.granted as string[]));
      setDirty(false);
    }
  }, [cardData]);

  const saveCards = useMutation({
    mutationFn: (cardIds: string[]) => api.put('/access-control/cards', { roleId, cardIds }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['access-control-cards', roleId] });
      queryClient.invalidateQueries({ queryKey: ['user-card-permissions'] });
      toast({ title: 'Card permissions saved' });
      setDirty(false);
    },
    onError: (e: any) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  const toggleCard = (cardId: string) => {
    setLocalGranted(prev => {
      if (!prev) return prev;
      const next = new Set(prev);
      if (next.has(cardId)) next.delete(cardId); else next.add(cardId);
      return next;
    });
    setDirty(true);
  };

  const toggleSubsystem = (subsystem: string, cards: CardDef[], shouldCheck: boolean) => {
    setLocalGranted(prev => {
      if (!prev) return prev;
      const next = new Set(prev);
      for (const card of cards) {
        const id = `${subsystem}.${card.key}`;
        if (shouldCheck) next.add(id); else next.delete(id);
      }
      return next;
    });
    setDirty(true);
  };

  if (isLoading || !localGranted) {
    return <div className="text-center text-muted-foreground py-8 text-sm">Loading card permissions…</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold">Card Visibility</h3>
          <p className="text-sm text-muted-foreground">
            Controls which stat cards <span className="text-foreground capitalize">{roleName.replace(/_/g, ' ')}</span> can see within each module
          </p>
        </div>
        <Button
          onClick={() => saveCards.mutate(Array.from(localGranted))}
          disabled={!dirty || saveCards.isPending}
          className="gradient-primary text-black font-medium"
        >
          {saveCards.isPending ? 'Saving…' : 'Save Card Access'}
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {Object.entries(CARD_REGISTRY).map(([subsystem, cards]) => {
          const cardIds = cards.map(c => `${subsystem}.${c.key}`);
          const checkedCount = cardIds.filter(id => localGranted.has(id)).length;
          return (
            <Card key={subsystem} className="border border-border">
              <CardHeader className="pb-2">
                <div className="flex items-center gap-2">
                  <SubsystemCheckbox
                    subsystem={subsystem}
                    cards={cards}
                    granted={localGranted}
                    onToggle={toggleSubsystem}
                  />
                  <CardTitle className="text-sm">{SUBSYSTEM_LABELS[subsystem] ?? subsystem}</CardTitle>
                  <span className="ml-auto text-xs text-muted-foreground">{checkedCount}/{cards.length}</span>
                </div>
              </CardHeader>
              <CardContent className="pt-0 space-y-1.5">
                {cards.map(card => {
                  const cardId = `${subsystem}.${card.key}`;
                  return (
                    <label key={cardId} className="flex items-center gap-2 cursor-pointer group pl-1">
                      <input
                        type="checkbox"
                        checked={localGranted.has(cardId)}
                        onChange={() => toggleCard(cardId)}
                        className="h-3.5 w-3.5 rounded border-border accent-primary cursor-pointer shrink-0"
                      />
                      <span className="text-xs text-muted-foreground group-hover:text-foreground transition-colors">
                        {card.label}
                      </span>
                    </label>
                  );
                })}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

// ─── Access Control Content ───────────────────────────────────────────────────

function AccessControlContent() {
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
    (base as any)[fieldMap[field]] = !(base as any)[fieldMap[field]];
    updatePermission.mutate({ roleId, subsystem, ...base });
  };

  const openRoleDialog = (u: any) => {
    setSelectedUser(u);
    setNewRoleId(u.role?.id ?? '');
    setRoleDialogOpen(true);
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h2 className="text-2xl font-bold">Access Control</h2>
        <p className="text-muted-foreground">Manage roles, permissions, and subsystem access</p>
      </div>

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

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {AC_SUBSYSTEM_KEYS.map((subsystem) => (
          <Card key={subsystem} className="border border-border">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <Shield className="h-4 w-4 text-primary" />
                {AC_SUBSYSTEM_LABELS[subsystem]}
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
                    const vals = [
                      perm ? perm.can_view : true,
                      perm ? perm.can_create : false,
                      perm ? perm.can_edit : false,
                      perm ? perm.can_delete : false,
                    ];
                    return (
                      <TableRow key={role.id}>
                        <TableCell className="text-xs py-2 pl-4 font-medium capitalize">{role.name.replace(/_/g, ' ')}</TableCell>
                        {(['can_view', 'can_create', 'can_edit', 'can_delete'] as const).map((field, idx) => (
                          <TableCell key={field} className={`py-2 text-center ${idx === 3 ? 'pr-4' : ''}`}>
                            <button
                              onClick={() => handlePermToggle(role.id, subsystem, field)}
                              className={`h-5 w-5 rounded border-2 flex items-center justify-center mx-auto transition-colors ${vals[idx] ? 'gradient-primary border-primary' : 'border-border bg-background hover:border-primary/50'}`}
                            >
                              {vals[idx] && <Check className="h-3 w-3 text-black" />}
                            </button>
                          </TableCell>
                        ))}
                      </TableRow>
                    );
                  })}
                  {!filteredRoles.length && (
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

      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-4">Card-Level Visibility</p>
        {roleFilter ? (
          <CardAccessSection
            roleId={roleFilter}
            roleName={roles.find((r: any) => r.id === roleFilter)?.name ?? ''}
          />
        ) : (
          <div className="flex items-center justify-center py-8 text-sm text-muted-foreground border border-dashed border-border rounded-lg">
            Select a role above to manage card-level visibility
          </div>
        )}
      </div>

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
                    <Button size="sm" onClick={() => openRoleDialog(u)} className="border border-input bg-background text-white hover:bg-accent hover:text-accent-foreground h-7 text-xs">
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

      <Dialog open={roleDialogOpen} onOpenChange={setRoleDialogOpen}>
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
              <Button onClick={() => setRoleDialogOpen(false)} className="border border-input bg-background text-white hover:bg-accent hover:text-accent-foreground">
                Cancel
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Settings (main two-pane layout) ─────────────────────────────────────────

export function Settings() {
  const [panel, setPanel] = useState<Panel>('profile');
  const [auditUserId, setAuditUserId] = useState<string | undefined>();
  const { signOut } = useAuth();
  const { theme } = useTheme();
  const { isAdmin } = usePermissions();

  const navSections = [
    {
      title: 'General',
      items: [
        { id: 'profile' as Panel, label: 'User Profile', icon: User },
        { id: 'theme' as Panel, label: 'Theme', icon: theme === 'dark' ? Moon : Sun },
        { id: 'change-password' as Panel, label: 'Change Password', icon: Key },
      ],
    },
    ...(isAdmin ? [
      {
        title: 'Users',
        items: [
          { id: 'list-users' as Panel, label: 'Users', icon: Users },
          { id: 'access-control' as Panel, label: 'Access Control', icon: Shield },
        ],
      },
      {
        title: 'Security',
        items: [
          { id: 'audit-log' as Panel, label: 'Audit Log', icon: ClipboardList },
        ],
      },
    ] : []),
  ];

  const handleNavAuditLog = (userId: string) => {
    setAuditUserId(userId);
    setPanel('audit-log');
  };

  return (
    <DashboardLayout>
      <div className="flex h-full min-h-0 -m-6">
        {/* Left sidebar */}
        <aside className="w-52 shrink-0 border-r border-border flex flex-col py-4 bg-background">
          <div className="px-4 pb-3 mb-2 border-b border-border">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Settings</h2>
          </div>
          <nav className="flex-1 overflow-y-auto px-2 space-y-4">
            {navSections.map((section) => (
              <div key={section.title}>
                <p className="px-2 py-1 text-xs text-muted-foreground font-medium uppercase tracking-wider">{section.title}</p>
                <div className="space-y-0.5">
                  {section.items.map((item) => (
                    <button
                      key={item.id}
                      onClick={() => setPanel(item.id)}
                      className={`w-full flex items-center gap-2 px-2 py-2 rounded-md text-sm transition-colors ${
                        panel === item.id
                          ? 'bg-sidebar-primary text-sidebar-primary-foreground'
                          : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                      }`}
                    >
                      <item.icon className="h-4 w-4 shrink-0" />
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </nav>
          <div className="px-2 pt-2 border-t border-border mt-2">
            <button
              onClick={() => {
                if (confirm('Sign out of AMIS?')) {
                  signOut();
                }
              }}
              className="w-full flex items-center gap-2 px-2 py-2 rounded-md text-sm text-destructive hover:bg-destructive/10 transition-colors"
            >
              <LogOut className="h-4 w-4 shrink-0" />
              Sign Out
            </button>
          </div>
        </aside>

        {/* Right content */}
        <main className="flex-1 overflow-y-auto p-6">
          {panel === 'profile' && <ProfilePanel />}
          {panel === 'theme' && <ThemePanel />}
          {panel === 'change-password' && <ChangePasswordPanel />}
          {panel === 'list-users' && isAdmin && <UsersPanel onViewAuditLog={handleNavAuditLog} />}
          {panel === 'audit-log' && isAdmin && <AuditLogPanel prefilterUserId={auditUserId} />}
          {panel === 'access-control' && isAdmin && <AccessControlContent />}
        </main>
      </div>
    </DashboardLayout>
  );
}

// ─── Access Control (standalone route — kept for backward compatibility) ──────

export function AccessControl() {
  return (
    <DashboardLayout>
      <AccessControlContent />
    </DashboardLayout>
  );
}
