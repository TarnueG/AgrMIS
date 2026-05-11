import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { Plus, Tractor, Search, Trash2, Wrench, AlertTriangle, CheckCircle, XCircle, PackageCheck } from 'lucide-react';
import { format } from 'date-fns';

type View = 'total' | 'operational' | 'active' | 'maintenance' | 'lost' | 'retired' | 'sold' | 'requests';

const ASSET_TYPES = ['equipment', 'vehicle', 'tool', 'infrastructure', 'other'];

const statusColor: Record<string, string> = {
  pending: 'bg-warning/20 text-warning',
  active: 'bg-success/20 text-success',
  operational: 'bg-primary/20 text-primary',
  under_maintenance: 'bg-warning/20 text-warning',
  lost: 'bg-destructive/20 text-destructive',
  retired: 'bg-muted text-muted-foreground',
  sold: 'bg-secondary text-secondary-foreground',
};

function requestStatusBadge(status: string) {
  const map: Record<string, string> = {
    pending: 'bg-warning/20 text-warning',
    approved: 'bg-success/20 text-success',
    disapproved: 'bg-destructive/20 text-destructive',
    delivered: 'bg-primary/20 text-primary',
  };
  return map[status] || 'bg-muted';
}

export default function Machinery() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [selectedView, setSelectedView] = useState<View>('total');

  const [isAssignOpen, setIsAssignOpen] = useState(false);
  const [isRequestOpen, setIsRequestOpen] = useState(false);
  const [isMaintenanceOpen, setIsMaintenanceOpen] = useState(false);
  const [isLostOpen, setIsLostOpen] = useState(false);
  const [isRetireOpen, setIsRetireOpen] = useState(false);
  const [isAddInventoryOpen, setIsAddInventoryOpen] = useState<string | null>(null);

  const [assignForm, setAssignForm] = useState({ assetId: '' });
  const [requestForm, setRequestForm] = useState({ name: '', assetType: 'equipment', model: '', notes: '' });
  const [maintenanceForm, setMaintenanceForm] = useState({
    name: '', assetType: 'equipment', model: '', status: 'under_maintenance',
    license: '', description: '', expectedFixDate: '',
  });
  const [lostForm, setLostForm] = useState({ name: '', license: '' });
  const [retireForm, setRetireForm] = useState({ name: '', license: '' });
  const [inventoryLicense, setInventoryLicense] = useState('');

  const { data: machinery = [] } = useQuery<any[]>({
    queryKey: ['machinery'],
    queryFn: async () => {
      const assets = await api.get<any[]>('/assets');
      return assets.map(a => ({
        id: a.id,
        name: a.name,
        type: a.asset_type,
        model: a.model ?? '',
        status: a.status,
        license: a.serial_number ?? '',
        notes: a.notes ?? '',
        next_service_date: a.next_service_date ?? null,
        created_at: a.created_at,
      }));
    },
  });

  const { data: requests = [] } = useQuery<any[]>({
    queryKey: ['equipment-requests'],
    queryFn: () => api.get<any[]>('/equipment-requests'),
  });

  const assignMutation = useMutation({
    mutationFn: ({ id }: { id: string }) =>
      api.patch(`/assets/${id}`, { status: 'active' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['machinery'] });
      toast({ title: 'Equipment assigned and set to Active' });
      setIsAssignOpen(false);
      setAssignForm({ assetId: '' });
    },
    onError: (e) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  const requestMutation = useMutation({
    mutationFn: (data: typeof requestForm) => api.post('/equipment-requests', {
      name: data.name, assetType: data.assetType, model: data.model || undefined, notes: data.notes || undefined,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['equipment-requests'] });
      toast({ title: 'Pending request submitted' });
      setIsRequestOpen(false);
      setRequestForm({ name: '', assetType: 'equipment', model: '', notes: '' });
    },
    onError: (e) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  const addMaintenanceMutation = useMutation({
    mutationFn: (data: typeof maintenanceForm) => api.post('/assets', {
      name: data.name,
      assetType: data.assetType,
      serialNumber: data.license || undefined,
      status: 'under_maintenance',
      nextServiceDate: data.expectedFixDate || undefined,
      notes: data.description || undefined,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['machinery'] });
      toast({ title: 'Added for maintenance' });
      setIsMaintenanceOpen(false);
      setMaintenanceForm({ name: '', assetType: 'equipment', model: '', status: 'under_maintenance', license: '', description: '', expectedFixDate: '' });
    },
    onError: (e) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  const updateStatusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => api.patch(`/assets/${id}`, { status }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['machinery'] }); toast({ title: 'Status updated' }); },
    onError: (e) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  const lostMutation = useMutation({
    mutationFn: (data: { name: string; license: string }) => {
      const match = machinery.find(m => m.name.toLowerCase() === data.name.toLowerCase() && m.license === data.license);
      if (!match) throw new Error('Equipment does not exist');
      return api.patch(`/assets/${match.id}`, { status: 'lost' });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['machinery'] });
      toast({ title: 'Equipment marked as lost' });
      setIsLostOpen(false);
      setLostForm({ name: '', license: '' });
    },
    onError: (e) => toast({ title: e.message, variant: 'destructive' }),
  });

  const retireMutation = useMutation({
    mutationFn: (data: { name: string; license: string }) => {
      const match = machinery.find(m => m.name.toLowerCase() === data.name.toLowerCase() && m.license === data.license);
      if (!match) throw new Error("Equipment doesn't exist");
      return api.patch(`/assets/${match.id}`, { status: 'retired' });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['machinery'] });
      toast({ title: 'Equipment retired' });
      setIsRetireOpen(false);
      setRetireForm({ name: '', license: '' });
    },
    onError: (e) => toast({ title: e.message, variant: 'destructive' }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/assets/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['machinery'] }),
  });

  const addToInventoryMutation = useMutation({
    mutationFn: ({ id, license }: { id: string; license: string }) =>
      api.patch(`/equipment-requests/${id}/add-to-inventory`, { license }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['equipment-requests'] });
      qc.invalidateQueries({ queryKey: ['machinery'] });
      toast({ title: 'Equipment added to inventory' });
      setIsAddInventoryOpen(null);
      setInventoryLicense('');
    },
    onError: (e) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  const deleteRequestMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/equipment-requests/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['equipment-requests'] }); toast({ title: 'Request deleted' }); },
    onError: (e) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  const markDeliveredMutation = useMutation({
    mutationFn: (id: string) => api.patch(`/equipment-requests/${id}/status`, { status: 'delivered' }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['equipment-requests'] }); toast({ title: 'Request marked as delivered' }); },
    onError: (e) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  const total = machinery.length;
  const activeCount = machinery.filter(m => m.status === 'active').length;
  const operationalCount = machinery.filter(m => m.status === 'operational').length;
  const maintenanceCount = machinery.filter(m => m.status === 'under_maintenance').length;
  const lostCount = machinery.filter(m => m.status === 'lost').length;
  const retiredCount = machinery.filter(m => ['retired', 'decommissioned'].includes(m.status)).length;
  const soldCount = machinery.filter(m => m.status === 'sold').length;

  const operationalAssets = machinery.filter(m => m.status === 'operational');

  function getViewData() {
    const q = search.toLowerCase();
    let data = machinery;
    if (selectedView === 'total') data = machinery;
    else if (selectedView === 'active') data = machinery.filter(m => m.status === 'active');
    else if (selectedView === 'operational') data = machinery.filter(m => m.status === 'operational');
    else if (selectedView === 'maintenance') data = machinery.filter(m => m.status === 'under_maintenance');
    else if (selectedView === 'lost') data = machinery.filter(m => m.status === 'lost');
    else if (selectedView === 'retired') data = machinery.filter(m => ['retired', 'decommissioned'].includes(m.status));
    else if (selectedView === 'sold') data = machinery.filter(m => m.status === 'sold');
    if (q) data = data.filter(m => m.name.toLowerCase().includes(q) || m.type.toLowerCase().includes(q));
    return data;
  }

  const viewData = getViewData();

  const CARDS: Array<{ key: View; label: string; count: number; color: string; icon: any }> = [
    { key: 'total', label: 'Total Equipment', count: total, color: 'bg-primary/10 border-primary/20', icon: Tractor },
    { key: 'active', label: 'Active Equipments', count: activeCount, color: 'bg-success/10 border-success/20', icon: CheckCircle },
    { key: 'operational', label: 'Operational', count: operationalCount, color: 'bg-info/10 border-blue-500/20', icon: Tractor },
    { key: 'maintenance', label: 'In Maintenance', count: maintenanceCount, color: 'bg-warning/10 border-warning/20', icon: Wrench },
    { key: 'lost', label: 'Lost Equipments', count: lostCount, color: 'bg-destructive/10 border-destructive/20', icon: AlertTriangle },
    { key: 'retired', label: 'Retired Equipments', count: retiredCount, color: 'bg-muted border-muted-foreground/20', icon: XCircle },
    { key: 'sold', label: 'Sold Equipments', count: soldCount, color: 'bg-secondary/10 border-secondary/20', icon: PackageCheck },
    { key: 'requests', label: 'Pending Requests', count: requests.filter(r => r.status === 'pending').length, color: 'bg-accent/10 border-accent/20', icon: Plus },
  ];

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold">Machinery</h1>
            <p className="text-muted-foreground">Manage farm equipment and vehicles</p>
          </div>
          <div className="flex gap-2">
            {selectedView === 'operational' && (
              <Button variant="outline" className="text-white" onClick={() => setIsAssignOpen(true)}>
                <Tractor className="h-4 w-4 mr-2" />Assign Machinery
              </Button>
            )}
            {(selectedView === 'active' || selectedView === 'maintenance') && (
              <Button className="gradient-primary text-black" onClick={() => setIsMaintenanceOpen(true)}>
                <Wrench className="h-4 w-4 mr-2" />Add for Maintenance
              </Button>
            )}
            {selectedView === 'lost' && (
              <Button variant="destructive" onClick={() => setIsLostOpen(true)}>
                <AlertTriangle className="h-4 w-4 mr-2" />Add Loss Equipment
              </Button>
            )}
            {selectedView === 'retired' && (
              <Button variant="outline" className="text-white" onClick={() => setIsRetireOpen(true)}>
                <XCircle className="h-4 w-4 mr-2" />Add Retire
              </Button>
            )}
            {!['operational', 'active', 'maintenance', 'lost', 'retired'].includes(selectedView) && (
              <Button className="gradient-primary text-black" onClick={() => setIsRequestOpen(true)}>
                <Plus className="h-4 w-4 mr-2" />Pending Request
              </Button>
            )}
          </div>
        </div>

        {/* Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {CARDS.map(({ key, label, count, color, icon: Icon }) => (
            <Card
              key={key}
              onClick={() => setSelectedView(key)}
              className={`cursor-pointer transition-all duration-200 hover:scale-105 hover:shadow-lg ${color} ${selectedView === key ? 'ring-2 ring-primary shadow-lg scale-105' : ''}`}
            >
              <CardContent className="p-4 flex items-center gap-3">
                <div className="p-2 rounded-lg bg-white/10"><Icon className="h-5 w-5" /></div>
                <div>
                  <p className="text-xs text-muted-foreground">{label}</p>
                  <p className="text-xl font-bold">{count}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Search bar */}
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search..." value={search} onChange={(e) => setSearch(e.target.value)} onBlur={() => setSearch('')} className="pl-9 text-white placeholder:text-white/50" />
        </div>

        {/* Main Table View */}
        {selectedView !== 'requests' && (
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Model</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>License</TableHead>
                  {selectedView === 'maintenance' && <TableHead>Expected Fix</TableHead>}
                  <TableHead>Date Added</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {viewData.map((m) => {
                  const isMaintenanceOverdue = m.next_service_date && new Date(m.next_service_date) <= new Date();
                  return (
                    <TableRow key={m.id}>
                      <TableCell className="font-medium">{m.name}</TableCell>
                      <TableCell className="capitalize">{m.type}</TableCell>
                      <TableCell>{m.model || '-'}</TableCell>
                      <TableCell>
                        <select
                          value={m.status}
                          onChange={(e) => updateStatusMutation.mutate({ id: m.id, status: e.target.value })}
                          disabled={updateStatusMutation.isPending}
                          className={`h-8 rounded border border-input bg-background px-2 text-sm ${statusColor[m.status] ?? 'text-foreground'}`}
                        >
                          <option value="pending">Pending</option>
                          <option value="active">Active</option>
                          <option value="operational">Operational</option>
                          <option value="under_maintenance">In Maintenance</option>
                          <option value="lost">Lost</option>
                          <option value="retired">Retired</option>
                          <option value="sold">Sold</option>
                        </select>
                      </TableCell>
                      <TableCell>{m.license || '-'}</TableCell>
                      {selectedView === 'maintenance' && (
                        <TableCell className={isMaintenanceOverdue ? 'text-destructive font-medium' : ''}>
                          {m.next_service_date ? format(new Date(m.next_service_date), 'MMM d, yyyy') : '-'}
                        </TableCell>
                      )}
                      <TableCell>{m.created_at ? format(new Date(m.created_at), 'MMM d, yyyy') : '-'}</TableCell>
                      <TableCell className="text-right flex gap-1 justify-end">
                        {selectedView === 'maintenance' && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-white"
                            disabled={m.status === 'operational' || updateStatusMutation.isPending}
                            onClick={() => updateStatusMutation.mutate({ id: m.id, status: 'operational' })}
                          >
                            Cancel Maintenance
                          </Button>
                        )}
                        <Button variant="ghost" size="icon" onClick={() => { if (confirm('Delete this equipment?')) deleteMutation.mutate(m.id); }}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
                {!viewData.length && (
                  <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">No equipment found</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </Card>
        )}

        {/* Requests View */}
        {selectedView === 'requests' && (
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Model</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {requests.map((r: any) => {
                  const isDelivered = r.status === 'delivered';
                  const alreadyAdded = r.added_to_inventory;
                  return (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium">{r.name}</TableCell>
                      <TableCell className="capitalize">{r.asset_type}</TableCell>
                      <TableCell>{r.model || '-'}</TableCell>
                      <TableCell><Badge className={requestStatusBadge(r.status)}>{r.status}</Badge></TableCell>
                      <TableCell>{r.created_at ? format(new Date(r.created_at), 'MMM d, yyyy') : '-'}</TableCell>
                      <TableCell className="text-right flex gap-1 justify-end items-center">
                        {r.status === 'approved' && (
                          <Button size="sm" variant="outline" className="text-white" onClick={() => { if (confirm('Mark this request as delivered?')) markDeliveredMutation.mutate(r.id); }} disabled={markDeliveredMutation.isPending}>
                            Mark Delivered
                          </Button>
                        )}
                        {isDelivered && !alreadyAdded && (
                          <Button size="sm" className="gradient-primary text-black" onClick={() => setIsAddInventoryOpen(r.id)}>
                            <Plus className="h-3 w-3 mr-1" />Add Equipment
                          </Button>
                        )}
                        {r.status === 'pending' && (
                          <Button variant="ghost" size="icon" onClick={() => { if (confirm('Delete this request?')) deleteRequestMutation.mutate(r.id); }}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
                {!requests.length && (
                  <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No pending requests</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </Card>
        )}
      </div>

      {/* Assign Machinery Dialog */}
      <Dialog open={isAssignOpen} onOpenChange={setIsAssignOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Assign Machinery</DialogTitle></DialogHeader>
          <form onSubmit={(e) => { e.preventDefault(); if (assignForm.assetId) assignMutation.mutate({ id: assignForm.assetId }); }} className="space-y-4">
            <div className="space-y-2">
              <Label>Select Operational Equipment</Label>
              <select
                value={assignForm.assetId}
                onChange={(e) => setAssignForm({ assetId: e.target.value })}
                required
                className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm text-foreground"
              >
                <option value="">Choose equipment...</option>
                {operationalAssets.map(a => (
                  <option key={a.id} value={a.id}>{a.name} ({a.model || a.type})</option>
                ))}
              </select>
            </div>
            <Button type="submit" className="w-full gradient-primary text-black" disabled={assignMutation.isPending || !assignForm.assetId}>
              Assign (Sets to Active)
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* Pending Request Dialog */}
      <Dialog open={isRequestOpen} onOpenChange={setIsRequestOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add Pending Request</DialogTitle></DialogHeader>
          <form onSubmit={(e) => { e.preventDefault(); requestMutation.mutate(requestForm); }} className="space-y-4">
            <div className="space-y-2">
              <Label>Equipment Name</Label>
              <Input value={requestForm.name} onChange={(e) => setRequestForm({ ...requestForm, name: e.target.value })} required />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Type</Label>
                <select
                  value={requestForm.assetType}
                  onChange={(e) => setRequestForm({ ...requestForm, assetType: e.target.value })}
                  className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm text-foreground"
                >
                  {ASSET_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div className="space-y-2">
                <Label>Model</Label>
                <Input value={requestForm.model} onChange={(e) => setRequestForm({ ...requestForm, model: e.target.value })} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Notes</Label>
              <Input value={requestForm.notes} onChange={(e) => setRequestForm({ ...requestForm, notes: e.target.value })} />
            </div>
            <p className="text-xs text-muted-foreground">Status will be set to <strong>Pending</strong> automatically.</p>
            <Button type="submit" className="w-full gradient-primary text-black" disabled={requestMutation.isPending}>Submit Request</Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* Add for Maintenance Dialog */}
      <Dialog open={isMaintenanceOpen} onOpenChange={setIsMaintenanceOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add for Maintenance</DialogTitle></DialogHeader>
          <form onSubmit={(e) => { e.preventDefault(); addMaintenanceMutation.mutate(maintenanceForm); }} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Equipment Name</Label>
                <Input value={maintenanceForm.name} onChange={(e) => setMaintenanceForm({ ...maintenanceForm, name: e.target.value })} required />
              </div>
              <div className="space-y-2">
                <Label>Type</Label>
                <select
                  value={maintenanceForm.assetType}
                  onChange={(e) => setMaintenanceForm({ ...maintenanceForm, assetType: e.target.value })}
                  className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm text-foreground"
                >
                  {ASSET_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Model</Label>
                <Input value={maintenanceForm.model} onChange={(e) => setMaintenanceForm({ ...maintenanceForm, model: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>License</Label>
                <Input value={maintenanceForm.license} onChange={(e) => setMaintenanceForm({ ...maintenanceForm, license: e.target.value })} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Description (max 50 words)</Label>
              <Input
                value={maintenanceForm.description}
                onChange={(e) => {
                  const words = e.target.value.trim().split(/\s+/).filter(Boolean);
                  if (words.length <= 50) setMaintenanceForm({ ...maintenanceForm, description: e.target.value });
                }}
              />
            </div>
            <div className="space-y-2">
              <Label>Expected Fix Date</Label>
              <Input type="date" value={maintenanceForm.expectedFixDate} onChange={(e) => setMaintenanceForm({ ...maintenanceForm, expectedFixDate: e.target.value })} />
            </div>
            <Button type="submit" className="w-full gradient-primary text-black" disabled={addMaintenanceMutation.isPending}>Add for Maintenance</Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* Add Loss Equipment Dialog */}
      <Dialog open={isLostOpen} onOpenChange={setIsLostOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Report Lost Equipment</DialogTitle></DialogHeader>
          <form onSubmit={(e) => {
            e.preventDefault();
            lostMutation.mutate(lostForm);
          }} className="space-y-4">
            <div className="space-y-2">
              <Label>Equipment Name</Label>
              <Input value={lostForm.name} onChange={(e) => setLostForm({ ...lostForm, name: e.target.value })} required />
            </div>
            <div className="space-y-2">
              <Label>License</Label>
              <Input value={lostForm.license} onChange={(e) => setLostForm({ ...lostForm, license: e.target.value })} required />
            </div>
            <p className="text-xs text-muted-foreground">Must match an existing equipment record.</p>
            <Button type="submit" className="w-full" variant="destructive" disabled={lostMutation.isPending}>Mark as Lost</Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* Add Retire Dialog */}
      <Dialog open={isRetireOpen} onOpenChange={setIsRetireOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Retire Equipment</DialogTitle></DialogHeader>
          <form onSubmit={(e) => {
            e.preventDefault();
            retireMutation.mutate(retireForm);
          }} className="space-y-4">
            <div className="space-y-2">
              <Label>Equipment Name</Label>
              <Input value={retireForm.name} onChange={(e) => setRetireForm({ ...retireForm, name: e.target.value })} required />
            </div>
            <div className="space-y-2">
              <Label>License Number</Label>
              <Input value={retireForm.license} onChange={(e) => setRetireForm({ ...retireForm, license: e.target.value })} required />
            </div>
            <p className="text-xs text-muted-foreground">Must match an existing equipment record. It will be moved to the retirement list.</p>
            <Button type="submit" className="w-full text-white" variant="outline" disabled={retireMutation.isPending}>Retire Equipment</Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* Add Equipment (from delivered request) Dialog */}
      <Dialog open={!!isAddInventoryOpen} onOpenChange={() => { setIsAddInventoryOpen(null); setInventoryLicense(''); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add Equipment to Inventory</DialogTitle></DialogHeader>
          {(() => {
            const req = isAddInventoryOpen ? requests.find((r: any) => r.id === isAddInventoryOpen) : null;
            return (
              <form onSubmit={(e) => {
                e.preventDefault();
                if (isAddInventoryOpen) addToInventoryMutation.mutate({ id: isAddInventoryOpen, license: inventoryLicense });
              }} className="space-y-4">
                {req && (
                  <div className="rounded-md border border-input bg-muted/30 p-3 space-y-2">
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div><span className="text-muted-foreground">Equipment Name</span><p className="font-medium">{req.name}</p></div>
                      <div><span className="text-muted-foreground">Type</span><p className="font-medium capitalize">{req.asset_type}</p></div>
                      {req.model && <div><span className="text-muted-foreground">Model</span><p className="font-medium">{req.model}</p></div>}
                      {req.notes && <div className="col-span-2"><span className="text-muted-foreground">Notes</span><p className="font-medium">{req.notes}</p></div>}
                    </div>
                  </div>
                )}
                <div className="space-y-2">
                  <Label>License Number</Label>
                  <Input value={inventoryLicense} onChange={(e) => setInventoryLicense(e.target.value)} required placeholder="Enter license/serial number" />
                </div>
                <Button type="submit" className="w-full gradient-primary text-black" disabled={addToInventoryMutation.isPending}>Add to Total Equipment</Button>
              </form>
            );
          })()}
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
