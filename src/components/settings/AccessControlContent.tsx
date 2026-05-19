import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Copy, Lock, Pencil, RotateCcw, Save, Shield, Trash2, User, Users } from 'lucide-react';
import api from '@/lib/api';
import { refreshModuleData } from '@/lib/module-refresh';
import { useToast } from '@/hooks/use-toast';
import { usePermissions } from '@/hooks/usePermissions';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import {
  ACCESS_CONTROL_SUBSYSTEMS,
  ALL_PERMISSION_KEYS,
  NO_ACCESS,
  type PermissionKey,
  type SubsystemAccess,
} from '@/lib/accessControl';

type RoleRecord = {
  id: string;
  name: string;
  description: string | null;
  assignedUsers: number;
  isSystemRole: boolean;
  isAdminRole: boolean;
  canReset: boolean;
};

type PermissionRow = {
  farm_id: string;
  role_id: string;
  subsystem: string;
  can_view: boolean;
  can_create: boolean;
  can_edit: boolean;
  can_delete: boolean;
  can_approve: boolean;
  can_export: boolean;
};

type UserRecord = {
  id: string;
  fullName: string;
  email: string;
  role: { id: string; name: string } | null;
  employee: { job_title?: string | null } | null;
};

type AccessControlResponse = {
  subsystems: Array<{ key: string; label: string }>;
  roles: RoleRecord[];
  permissions: PermissionRow[];
};

type UsersResponse = {
  users: UserRecord[];
  roles: RoleRecord[];
};

type RoleEditorMode = 'create' | 'edit' | null;

const FIELD_MAP: Record<PermissionKey, keyof PermissionRow> = {
  canView: 'can_view',
  canCreate: 'can_create',
  canEdit: 'can_edit',
  canDelete: 'can_delete',
  canApprove: 'can_approve',
  canExport: 'can_export',
};

const ACTION_LABELS: Record<PermissionKey, string> = {
  canView: 'View',
  canCreate: 'Create',
  canEdit: 'Edit',
  canDelete: 'Delete',
  canApprove: 'Approve',
  canExport: 'Export',
};

function normalizePermissions(rows: PermissionRow[]) {
  const byRole: Record<string, Record<string, SubsystemAccess>> = {};

  rows.forEach((row) => {
    if (!byRole[row.role_id]) {
      byRole[row.role_id] = {};
    }

    byRole[row.role_id][row.subsystem] = {
      canView: row.can_view,
      canCreate: row.can_create,
      canEdit: row.can_edit,
      canDelete: row.can_delete,
      canApprove: row.can_approve,
      canExport: row.can_export,
    };
  });

  return byRole;
}

function cloneDraft(source: Record<string, Record<string, SubsystemAccess>>) {
  return JSON.parse(JSON.stringify(source)) as Record<string, Record<string, SubsystemAccess>>;
}

function displayRoleName(name: string) {
  return name.replace(/_/g, ' ');
}

export function AccessControlContent() {
  const { toast } = useToast();
  const { canCreate, canDelete, canEdit } = usePermissions();
  const queryClient = useQueryClient();
  const [roleFilter, setRoleFilter] = useState('');
  const [draftPermissions, setDraftPermissions] = useState<Record<string, Record<string, SubsystemAccess>>>({});
  const [baselinePermissions, setBaselinePermissions] = useState<Record<string, Record<string, SubsystemAccess>>>({});
  const [roleDialogMode, setRoleDialogMode] = useState<RoleEditorMode>(null);
  const [roleName, setRoleName] = useState('');
  const [roleDescription, setRoleDescription] = useState('');
  const [duplicateFromRoleId, setDuplicateFromRoleId] = useState('');
  const [selectedUser, setSelectedUser] = useState<UserRecord | null>(null);
  const [userRoleId, setUserRoleId] = useState('');
  const refreshAccessControl = () =>
    refreshModuleData(queryClient, [
      ['access-control-subsystems'],
      ['access-control-users'],
      ['user-permissions'],
    ]);

  const { data: accessData } = useQuery({
    queryKey: ['access-control-subsystems'],
    queryFn: () => api.get<AccessControlResponse>('/access-control/subsystems'),
  });

  const { data: usersData } = useQuery({
    queryKey: ['access-control-users'],
    queryFn: () => api.get<UsersResponse>('/access-control/users'),
  });

  const roles = accessData?.roles ?? [];
  const users = usersData?.users ?? [];

  useEffect(() => {
    if (!accessData) return;

    const normalized = normalizePermissions(accessData.permissions);
    setDraftPermissions(cloneDraft(normalized));
    setBaselinePermissions(cloneDraft(normalized));

    if (!roleFilter && accessData.roles[0]) {
      setRoleFilter(accessData.roles[0].id);
    }
  }, [accessData, roleFilter]);

  const selectedRole = roles.find((role) => role.id === roleFilter) ?? roles[0] ?? null;
  const selectedPermissions = selectedRole ? (draftPermissions[selectedRole.id] ?? {}) : {};
  const selectedBaseline = selectedRole ? (baselinePermissions[selectedRole.id] ?? {}) : {};

  const isDirty = useMemo(() => {
    if (!selectedRole) return false;
    return JSON.stringify(selectedPermissions) !== JSON.stringify(selectedBaseline);
  }, [selectedBaseline, selectedPermissions, selectedRole]);

  useEffect(() => {
    if (!isDirty) return undefined;

    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };

    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [isDirty]);

  const savePermissions = useMutation({
    mutationFn: (roleId: string) =>
      api.put(`/access-control/roles/${roleId}/permissions`, {
        permissions: ACCESS_CONTROL_SUBSYSTEMS.map((subsystem) => ({
          subsystem: subsystem.key,
          ...(draftPermissions[roleId]?.[subsystem.key] ?? NO_ACCESS),
        })),
      }),
    onSuccess: () => {
      toast({ title: 'Permissions saved' });
      void refreshAccessControl();
    },
    onError: (error: Error) => {
      toast({ title: 'Save failed', description: error.message, variant: 'destructive' });
    },
  });

  const createRole = useMutation({
    mutationFn: () =>
      api.post('/access-control/roles', {
        name: roleName,
        description: roleDescription || null,
        duplicateFromRoleId: duplicateFromRoleId || null,
      }),
    onSuccess: () => {
      toast({ title: 'Role created' });
      setRoleDialogMode(null);
      resetRoleDialog();
      void refreshAccessControl();
    },
    onError: (error: Error) => {
      toast({ title: 'Create failed', description: error.message, variant: 'destructive' });
    },
  });

  const updateRole = useMutation({
    mutationFn: (roleId: string) =>
      api.patch(`/access-control/roles/${roleId}`, {
        name: roleName,
        description: roleDescription || null,
      }),
    onSuccess: () => {
      toast({ title: 'Role updated' });
      setRoleDialogMode(null);
      resetRoleDialog();
      void refreshAccessControl();
    },
    onError: (error: Error) => {
      toast({ title: 'Update failed', description: error.message, variant: 'destructive' });
    },
  });

  const duplicateRole = useMutation({
    mutationFn: (roleId: string) => api.post(`/access-control/roles/${roleId}/duplicate`, {}),
    onSuccess: () => {
      toast({ title: 'Role duplicated' });
      void refreshAccessControl();
    },
    onError: (error: Error) => {
      toast({ title: 'Duplicate failed', description: error.message, variant: 'destructive' });
    },
  });

  const resetRole = useMutation({
    mutationFn: (roleId: string) => api.post(`/access-control/roles/${roleId}/reset`, {}),
    onSuccess: () => {
      toast({ title: 'Role reset to defaults' });
      void refreshAccessControl();
    },
    onError: (error: Error) => {
      toast({ title: 'Reset failed', description: error.message, variant: 'destructive' });
    },
  });

  const deleteRole = useMutation({
    mutationFn: (roleId: string) => api.delete(`/access-control/roles/${roleId}`),
    onSuccess: () => {
      toast({ title: 'Role deleted' });
      void refreshAccessControl();
      setRoleFilter('');
    },
    onError: (error: Error) => {
      toast({ title: 'Delete failed', description: error.message, variant: 'destructive' });
    },
  });

  const assignRole = useMutation({
    mutationFn: ({ userId, roleId }: { userId: string; roleId: string }) =>
      api.patch(`/access-control/users/${userId}/role`, { roleId }),
    onSuccess: () => {
      toast({ title: 'User role updated' });
      setSelectedUser(null);
      setUserRoleId('');
      void refreshAccessControl();
    },
    onError: (error: Error) => {
      toast({ title: 'Role update failed', description: error.message, variant: 'destructive' });
    },
  });

  const visibleModules = ACCESS_CONTROL_SUBSYSTEMS.filter(
    (subsystem) => selectedPermissions[subsystem.key]?.canView,
  );

  const actionSummary = ALL_PERMISSION_KEYS.map((permissionKey) => ({
    label: ACTION_LABELS[permissionKey],
    allowed: ACCESS_CONTROL_SUBSYSTEMS.filter((subsystem) => selectedPermissions[subsystem.key]?.[permissionKey]).map((subsystem) => subsystem.label),
    blocked: ACCESS_CONTROL_SUBSYSTEMS.filter((subsystem) => !selectedPermissions[subsystem.key]?.[permissionKey]).map((subsystem) => subsystem.label),
  }));

  const setPermission = (subsystem: string, permission: PermissionKey) => {
    if (!selectedRole || selectedRole.isAdminRole || !canEdit('access_control')) return;

    setDraftPermissions((current) => {
      const next = cloneDraft(current);
      const rolePermissions = next[selectedRole.id] ?? {};
      const base = rolePermissions[subsystem] ?? { ...NO_ACCESS };
      rolePermissions[subsystem] = {
        ...base,
        [permission]: !base[permission],
      };
      next[selectedRole.id] = rolePermissions;
      return next;
    });
  };

  const discardChanges = () => {
    if (!selectedRole) return;

    setDraftPermissions((current) => ({
      ...current,
      [selectedRole.id]: cloneDraft({ [selectedRole.id]: baselinePermissions[selectedRole.id] ?? {} })[selectedRole.id] ?? {},
    }));
  };

  const handleRoleChange = (nextRoleId: string) => {
    if (nextRoleId === roleFilter) return;
    if (isDirty && !window.confirm('You have unsaved permission changes. Discard them and switch roles?')) {
      return;
    }
    setRoleFilter(nextRoleId);
  };

  const openCreateDialog = () => {
    setRoleDialogMode('create');
    resetRoleDialog();
  };

  const openEditDialog = () => {
    if (!selectedRole) return;
    setRoleDialogMode('edit');
    setRoleName(selectedRole.name);
    setRoleDescription(selectedRole.description ?? '');
    setDuplicateFromRoleId('');
  };

  const resetRoleDialog = () => {
    setRoleName('');
    setRoleDescription('');
    setDuplicateFromRoleId(selectedRole?.id ?? '');
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <h2 className="text-2xl font-bold">Access Control</h2>
          <p className="text-muted-foreground">Persisted role permissions, role lifecycle management, and effective access preview.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={openCreateDialog} disabled={!canCreate('access_control')} className="gradient-primary text-black font-medium">
            <Shield className="mr-2 h-4 w-4" />
            Create Role
          </Button>
          <Button variant="outline" onClick={openEditDialog} disabled={!selectedRole || selectedRole.isAdminRole || !canEdit('access_control')}>
            <Pencil className="mr-2 h-4 w-4" />
            Edit Role
          </Button>
          <Button variant="outline" onClick={() => selectedRole && duplicateRole.mutate(selectedRole.id)} disabled={!selectedRole || duplicateRole.isPending || !canCreate('access_control')}>
            <Copy className="mr-2 h-4 w-4" />
            Duplicate
          </Button>
          <Button
            variant="outline"
            onClick={() => selectedRole && window.confirm(`Reset ${displayRoleName(selectedRole.name)} to defaults?`) && resetRole.mutate(selectedRole.id)}
            disabled={!selectedRole || !selectedRole.canReset || resetRole.isPending || !canEdit('access_control')}
          >
            <RotateCcw className="mr-2 h-4 w-4" />
            Reset
          </Button>
          <Button
            variant="destructive"
            onClick={() => selectedRole && window.confirm(`Delete role ${displayRoleName(selectedRole.name)}?`) && deleteRole.mutate(selectedRole.id)}
            disabled={!selectedRole || selectedRole.isSystemRole || selectedRole.assignedUsers > 0 || deleteRole.isPending || !canDelete('access_control')}
          >
            <Trash2 className="mr-2 h-4 w-4" />
            Delete
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <Card>
          <CardHeader className="space-y-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <CardTitle>Permission Matrix</CardTitle>
                <p className="text-sm text-muted-foreground">Select a role, adjust module permissions, then save the full draft.</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Label className="text-sm text-muted-foreground">Role</Label>
                <select
                  value={selectedRole?.id ?? ''}
                  onChange={(event) => handleRoleChange(event.target.value)}
                  className="h-10 rounded-md border border-input bg-background px-3 text-sm text-foreground"
                >
                  {roles.map((role) => (
                    <option key={role.id} value={role.id}>
                      {displayRoleName(role.name)}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            {selectedRole && (
              <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                <span className="rounded-full border border-border px-3 py-1">
                  {selectedRole.assignedUsers} assigned user{selectedRole.assignedUsers === 1 ? '' : 's'}
                </span>
                {selectedRole.isSystemRole && (
                  <span className="rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-primary">
                    System role
                  </span>
                )}
                {selectedRole.isAdminRole && (
                  <span className="rounded-full border border-warning/30 bg-warning/10 px-3 py-1 text-warning">
                    Super Admin protection enabled
                  </span>
                )}
                {isDirty && (
                  <span className="rounded-full border border-destructive/30 bg-destructive/10 px-3 py-1 text-destructive">
                    Unsaved changes
                  </span>
                )}
              </div>
            )}
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Module</TableHead>
                    {ALL_PERMISSION_KEYS.map((permissionKey) => (
                      <TableHead key={permissionKey} className="text-center">
                        {ACTION_LABELS[permissionKey]}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {ACCESS_CONTROL_SUBSYSTEMS.map((subsystem) => {
                    const values = selectedPermissions[subsystem.key] ?? NO_ACCESS;
                    return (
                      <TableRow key={subsystem.key}>
                        <TableCell className="font-medium">{subsystem.label}</TableCell>
                        {ALL_PERMISSION_KEYS.map((permissionKey) => (
                          <TableCell key={permissionKey} className="text-center">
                            <button
                              type="button"
                              onClick={() => setPermission(subsystem.key, permissionKey)}
                              disabled={!selectedRole || selectedRole.isAdminRole || !canEdit('access_control')}
                              className={`mx-auto flex h-5 w-5 items-center justify-center rounded border-2 transition-colors ${
                                values[permissionKey]
                                  ? 'gradient-primary border-primary'
                                  : 'border-border bg-background hover:border-primary/50'
                              } disabled:cursor-not-allowed disabled:opacity-50`}
                            >
                              {values[permissionKey] && <Check className="h-3 w-3 text-black" />}
                            </button>
                          </TableCell>
                        ))}
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>

            <div className="flex flex-wrap justify-end gap-2">
              <Button variant="outline" onClick={discardChanges} disabled={!isDirty || !selectedRole || !canEdit('access_control')}>
                Discard Changes
              </Button>
              <Button onClick={() => selectedRole && savePermissions.mutate(selectedRole.id)} disabled={!isDirty || !selectedRole || selectedRole.isAdminRole || savePermissions.isPending || !canEdit('access_control')} className="gradient-primary text-black font-medium">
                <Save className="mr-2 h-4 w-4" />
                Save Permissions
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Effective Access Preview</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <div className="rounded-lg border border-border bg-card/60 p-4">
              <p className="text-xs uppercase tracking-wider text-muted-foreground">Visible sidebar modules</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {visibleModules.length ? visibleModules.map((module) => (
                  <span key={module.key} className="rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-primary">
                    {module.label}
                  </span>
                )) : (
                  <span className="text-muted-foreground">No modules visible.</span>
                )}
              </div>
            </div>

            <div className="space-y-3">
              {actionSummary.map((summary) => (
                <div key={summary.label} className="rounded-lg border border-border bg-card/60 p-4">
                  <p className="font-medium">{summary.label}</p>
                  <p className="mt-2 text-xs text-muted-foreground">Allowed on: {summary.allowed.length ? summary.allowed.join(', ') : 'none'}</p>
                  <p className="mt-1 text-xs text-muted-foreground">Blocked on: {summary.blocked.length ? summary.blocked.join(', ') : 'none'}</p>
                </div>
              ))}
            </div>

            {selectedRole?.isAdminRole && (
              <div className="rounded-lg border border-warning/30 bg-warning/10 p-4 text-warning">
                <div className="flex items-start gap-2">
                  <Lock className="mt-0.5 h-4 w-4" />
                  <p>Super Admin and Admin always retain full access. Their permission matrix is read-only.</p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
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
              {users.map((user) => (
                <TableRow key={user.id}>
                  <TableCell className="font-medium">{user.fullName}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{user.email}</TableCell>
                  <TableCell className="text-sm">{user.employee?.job_title ?? '-'}</TableCell>
                  <TableCell>
                    <span className="rounded-full bg-primary/20 px-2 py-0.5 text-xs text-primary">
                      {displayRoleName(user.role?.name ?? 'unassigned')}
                    </span>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setSelectedUser(user);
                        setUserRoleId(user.role?.id ?? '');
                      }}
                      disabled={!canEdit('access_control')}
                    >
                      <Users className="mr-2 h-4 w-4" />
                      Change Role
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={roleDialogMode !== null} onOpenChange={(open) => { if (!open) { setRoleDialogMode(null); resetRoleDialog(); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{roleDialogMode === 'create' ? 'Create Role' : 'Edit Role'}</DialogTitle>
          </DialogHeader>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (roleDialogMode === 'create') {
                createRole.mutate();
              } else if (selectedRole) {
                updateRole.mutate(selectedRole.id);
              }
            }}
            className="space-y-4"
          >
            <div className="space-y-2">
              <Label>Role Name</Label>
              <Input value={roleName} onChange={(event) => setRoleName(event.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea value={roleDescription} onChange={(event) => setRoleDescription(event.target.value)} rows={4} />
            </div>
            {roleDialogMode === 'create' && (
              <div className="space-y-2">
                <Label>Duplicate Permissions From</Label>
                <select
                  value={duplicateFromRoleId}
                  onChange={(event) => setDuplicateFromRoleId(event.target.value)}
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground"
                >
                  <option value="">Start from defaults</option>
                  {roles.map((role) => (
                    <option key={role.id} value={role.id}>
                      {displayRoleName(role.name)}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setRoleDialogMode(null)}>
                Cancel
              </Button>
              <Button type="submit" className="gradient-primary text-black font-medium" disabled={createRole.isPending || updateRole.isPending || (roleDialogMode === 'create' ? !canCreate('access_control') : !canEdit('access_control'))}>
                Save Role
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!selectedUser} onOpenChange={(open) => { if (!open) { setSelectedUser(null); setUserRoleId(''); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Change Role</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <p className="font-medium">{selectedUser?.fullName}</p>
              <p className="text-sm text-muted-foreground">{selectedUser?.email}</p>
            </div>
            <div className="space-y-2">
              <Label>Assign Role</Label>
              <select
                value={userRoleId}
                onChange={(event) => setUserRoleId(event.target.value)}
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground"
              >
                <option value="">Select role</option>
                {roles.map((role) => (
                  <option key={role.id} value={role.id}>
                    {displayRoleName(role.name)}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setSelectedUser(null)}>
                Cancel
              </Button>
              <Button
                type="button"
                className="gradient-primary text-black font-medium"
                disabled={!selectedUser || !userRoleId || assignRole.isPending || !canEdit('access_control')}
                onClick={() => selectedUser && assignRole.mutate({ userId: selectedUser.id, roleId: userRoleId })}
              >
                Save Assignment
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
