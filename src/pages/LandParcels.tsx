import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { Plus, Wheat, Search, Trash2, MapPin, Edit, ClipboardList } from 'lucide-react';
import { usePermissions } from '@/hooks/usePermissions';

type ParcelView = 'requested' | 'active' | 'inactive' | 'total';

const soilTypes = ['loamy', 'clay', 'sandy', 'silty', 'peaty'];

export default function LandParcels() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { canCreate, canEdit, canDelete } = usePermissions();
  const [selectedView, setSelectedView] = useState<ParcelView>('requested');
  const [search, setSearch] = useState('');
  const [totalFilter, setTotalFilter] = useState('');

  const [isRequestOpen, setIsRequestOpen] = useState(false);
  const [isEditRequestOpen, setIsEditRequestOpen] = useState(false);
  const [isAssignOpen, setIsAssignOpen] = useState(false);
  const [isEditParcelOpen, setIsEditParcelOpen] = useState(false);
  const [editingRequest, setEditingRequest] = useState<any>(null);
  const [editingParcel, setEditingParcel] = useState<any>(null);

  const [requestForm, setRequestForm] = useState({ name: '', sizeHectares: 0, soilType: 'loamy', description: '', location: '' });
  const [editReqForm, setEditReqForm] = useState({ name: '', sizeHectares: 0, soilType: 'loamy', description: '', location: '' });
  const [assignForm, setAssignForm] = useState({ parcelId: '', cropName: '', status: 'active' });
  const [editParcelForm, setEditParcelForm] = useState({ name: '', sizeHectares: 0, soilType: 'loamy', location: '', status: 'inactive', notes: '' });

  const { data: parcels = [] } = useQuery<any[]>({
    queryKey: ['land-parcels'],
    queryFn: () => api.get<any[]>('/land-parcels'),
  });

  const { data: requests = [] } = useQuery<any[]>({
    queryKey: ['parcel-requests'],
    queryFn: () => api.get<any[]>('/parcel-requests'),
  });

  const activeParcels = parcels.filter(p => p.status === 'active');
  const inactiveParcels = parcels.filter(p => ['inactive', 'preparation', 'fallow'].includes(p.status));
  const pendingRequests = requests.filter((r: any) => r.status === 'pending');

  const requestMutation = useMutation({
    mutationFn: (d: typeof requestForm) => api.post('/parcel-requests', {
      name: d.name,
      sizeHectares: d.sizeHectares || undefined,
      soilType: d.soilType,
      description: d.description || undefined,
      location: d.location || undefined,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['parcel-requests'] });
      toast({ title: 'Parcel request submitted — awaiting approval' });
      setIsRequestOpen(false);
      setRequestForm({ name: '', sizeHectares: 0, soilType: 'loamy', description: '', location: '' });
    },
    onError: (e) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  const editRequestMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => api.patch(`/parcel-requests/${id}`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['parcel-requests'] });
      toast({ title: 'Request updated' });
      setIsEditRequestOpen(false);
    },
    onError: (e) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  const deleteRequestMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/parcel-requests/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['parcel-requests'] }); toast({ title: 'Request deleted' }); },
    onError: (e) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  const assignMutation = useMutation({
    mutationFn: (d: typeof assignForm) => api.post('/land-parcels/assign', {
      parcelId: d.parcelId,
      cropName: d.cropName,
      status: d.status,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['land-parcels'] });
      toast({ title: 'Parcel assigned successfully' });
      setIsAssignOpen(false);
      setAssignForm({ parcelId: '', cropName: '', status: 'active' });
    },
    onError: (e) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  const updateStatusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => api.patch(`/land-parcels/${id}`, { status }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['land-parcels'] }),
    onError: (e) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  const editParcelMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => api.patch(`/land-parcels/${id}`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['land-parcels'] });
      toast({ title: 'Parcel updated' });
      setIsEditParcelOpen(false);
    },
    onError: (e) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/land-parcels/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['land-parcels'] }); toast({ title: 'Parcel deleted' }); },
    onError: (e) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  const openEditRequest = (r: any) => {
    setEditingRequest(r);
    setEditReqForm({ name: r.name, sizeHectares: r.size_hectares || 0, soilType: r.soil_type || 'loamy', description: r.description || '', location: r.location || '' });
    setIsEditRequestOpen(true);
  };

  const openEditParcel = (p: any) => {
    setEditingParcel(p);
    setEditParcelForm({ name: p.name, sizeHectares: Number(p.size_hectares) || 0, soilType: p.soil_type || 'loamy', location: p.location || '', status: p.status, notes: p.notes || '' });
    setIsEditParcelOpen(true);
  };

  const reqBadge = (status: string) => {
    const map: Record<string, string> = {
      pending: 'bg-warning/20 text-warning',
      approved: 'bg-success/20 text-success',
      disapproved: 'bg-destructive/20 text-destructive',
    };
    return map[status] || 'bg-muted';
  };

  const totalFiltered = (totalFilter ? parcels.filter(p => p.status === totalFilter) : parcels)
    .filter(p => p.name.toLowerCase().includes(search.toLowerCase()));
  const searchedActive = activeParcels.filter(p => p.name.toLowerCase().includes(search.toLowerCase()));
  const searchedInactive = inactiveParcels.filter(p => p.name.toLowerCase().includes(search.toLowerCase()));

  const CARDS = [
    { key: 'requested' as ParcelView, label: 'Requested Parcel', count: pendingRequests.length, Icon: ClipboardList, color: 'bg-warning/10 border-warning/20 text-warning' },
    { key: 'active' as ParcelView, label: 'Active Parcel', count: activeParcels.length, Icon: Wheat, color: 'bg-success/10 border-success/20 text-success' },
    { key: 'inactive' as ParcelView, label: 'Inactive Parcel', count: inactiveParcels.length, Icon: MapPin, color: 'bg-muted border-muted-foreground/20 text-muted-foreground' },
    { key: 'total' as ParcelView, label: 'Total Parcel', count: parcels.length, Icon: MapPin, color: 'bg-primary/10 border-primary/20 text-primary' },
  ];

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold">Land Parcels</h1>
            <p className="text-muted-foreground">Manage agricultural land and crops</p>
          </div>
          <div className="flex gap-2">
            {(selectedView === 'requested' || selectedView === 'total') && canCreate('land_parcels') && (
              <Button className="gradient-primary text-black font-medium" onClick={() => setIsRequestOpen(true)}>
                <Plus className="h-4 w-4 mr-2" /> Request Parcel
              </Button>
            )}
            {(selectedView === 'active' || selectedView === 'inactive') && canEdit('land_parcels') && (
              <Button variant="outline" className="border border-input bg-background text-white hover:bg-accent hover:text-accent-foreground" onClick={() => { setAssignForm({ parcelId: '', cropName: '', status: 'active' }); setIsAssignOpen(true); }}>
                <MapPin className="h-4 w-4 mr-2" /> Assign Parcel
              </Button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {CARDS.map(({ key, label, count, Icon, color }) => (
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

        {selectedView === 'requested' && (
          <Card>
            <CardHeader>
              <h3 className="font-semibold">Parcel Requests</h3>
            </CardHeader>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Size</TableHead>
                  <TableHead>Soil Type</TableHead>
                  <TableHead>Location</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pendingRequests.map((r: any) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">{r.name}</TableCell>
                    <TableCell>{r.size_hectares ? `${Number(r.size_hectares).toFixed(1)} ha` : '-'}</TableCell>
                    <TableCell className="capitalize">{r.soil_type || '-'}</TableCell>
                    <TableCell>{r.location || '-'}</TableCell>
                    <TableCell className="max-w-xs truncate">{r.description || '-'}</TableCell>
                    <TableCell><Badge className={reqBadge(r.status)}>{r.status}</Badge></TableCell>
                    <TableCell className="text-right space-x-1">
                      {canEdit('land_parcels') && (
                        <Button variant="ghost" size="icon" onClick={() => openEditRequest(r)}>
                          <Edit className="h-4 w-4" />
                        </Button>
                      )}
                      {canDelete('land_parcels') && (
                        <Button variant="ghost" size="icon" onClick={() => { if (confirm('Delete this parcel request?')) deleteRequestMutation.mutate(r.id); }}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
                {!pendingRequests.length && (
                  <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">No pending parcel requests</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </Card>
        )}

        {selectedView === 'active' && (
          <Card>
            <CardHeader>
              <div className="relative max-w-xs">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search active parcels..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  onBlur={() => setSearch('')}
                  className="pl-9 text-white placeholder:text-white/50"
                />
              </div>
            </CardHeader>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Size</TableHead>
                  <TableHead>Crop</TableHead>
                  <TableHead>Soil Type</TableHead>
                  <TableHead>Location</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {searchedActive.map((p: any) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium">{p.name}</TableCell>
                    <TableCell>{Number(p.size_hectares).toFixed(1)} ha</TableCell>
                    <TableCell>{p.crop_type || '-'}</TableCell>
                    <TableCell className="capitalize">{p.soil_type}</TableCell>
                    <TableCell>{p.location || '-'}</TableCell>
                    <TableCell>
                      {canEdit('land_parcels') ? (
                        <select
                          value={p.status}
                          onChange={(e) => { const ns = e.target.value; if (confirm(`Change status to "${ns}"?`)) updateStatusMutation.mutate({ id: p.id, status: ns }); }}
                          className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm text-foreground"
                        >
                          {['active', 'inactive', 'fallow', 'preparation', 'harvested'].map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                      ) : (
                        <Badge className="bg-success/20 text-success">{p.status}</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {canDelete('land_parcels') && (
                        <Button variant="ghost" size="icon" onClick={() => { if (confirm('Delete this land parcel?')) deleteMutation.mutate(p.id); }}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
                {!searchedActive.length && (
                  <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">No active parcels found</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </Card>
        )}

        {selectedView === 'inactive' && (
          <Card>
            <CardHeader>
              <div className="relative max-w-xs">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search inactive parcels..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  onBlur={() => setSearch('')}
                  className="pl-9 text-white placeholder:text-white/50"
                />
              </div>
            </CardHeader>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Size</TableHead>
                  <TableHead>Soil Type</TableHead>
                  <TableHead>Location</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {searchedInactive.map((p: any) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium">{p.name}</TableCell>
                    <TableCell>{Number(p.size_hectares).toFixed(1)} ha</TableCell>
                    <TableCell className="capitalize">{p.soil_type}</TableCell>
                    <TableCell>{p.location || '-'}</TableCell>
                    <TableCell>
                      {canEdit('land_parcels') ? (
                        <select
                          value={p.status}
                          onChange={(e) => { const ns = e.target.value; if (confirm(`Change status to "${ns}"?`)) updateStatusMutation.mutate({ id: p.id, status: ns }); }}
                          className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm text-foreground"
                        >
                          {['inactive', 'fallow', 'preparation', 'harvested', 'active'].map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                      ) : (
                        <Badge className="bg-muted text-muted-foreground">{p.status}</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {canEdit('land_parcels') && (
                        <Button variant="ghost" size="icon" onClick={() => openEditParcel(p)}>
                          <Edit className="h-4 w-4" />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
                {!searchedInactive.length && (
                  <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No inactive parcels found</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </Card>
        )}

        {selectedView === 'total' && (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between gap-4">
                <div className="relative max-w-xs flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search all parcels..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    onBlur={() => setSearch('')}
                    className="pl-9 text-white placeholder:text-white/50"
                  />
                </div>
                <select
                  value={totalFilter}
                  onChange={(e) => setTotalFilter(e.target.value)}
                  className="h-10 rounded-md border border-input bg-background px-3 text-sm text-foreground"
                >
                  <option value="">All Statuses</option>
                  {['active', 'inactive', 'fallow', 'preparation', 'harvested'].map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            </CardHeader>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Size</TableHead>
                  <TableHead>Crop</TableHead>
                  <TableHead>Soil Type</TableHead>
                  <TableHead>Location</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {totalFiltered.map((p: any) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium">{p.name}</TableCell>
                    <TableCell>{Number(p.size_hectares).toFixed(1)} ha</TableCell>
                    <TableCell>{p.crop_type || '-'}</TableCell>
                    <TableCell className="capitalize">{p.soil_type}</TableCell>
                    <TableCell>{p.location || '-'}</TableCell>
                    <TableCell>
                      <Badge className={p.status === 'active' ? 'bg-success/20 text-success' : p.status === 'fallow' ? 'bg-warning/20 text-warning' : 'bg-muted text-muted-foreground'}>
                        {p.status}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
                {!totalFiltered.length && (
                  <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No parcels found</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </Card>
        )}
      </div>

      {/* Request Parcel Dialog */}
      {canCreate('land_parcels') && (
      <Dialog open={isRequestOpen} onOpenChange={setIsRequestOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Request Land Parcel</DialogTitle></DialogHeader>
          <form onSubmit={(e) => { e.preventDefault(); requestMutation.mutate(requestForm); }} className="space-y-4">
            <div className="space-y-2">
              <Label>Parcel Name</Label>
              <Input value={requestForm.name} onChange={(e) => setRequestForm({ ...requestForm, name: e.target.value })} required />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Size (Hectares)</Label>
                <Input type="number" step="0.01" min="0" value={requestForm.sizeHectares} onChange={(e) => setRequestForm({ ...requestForm, sizeHectares: Number(e.target.value) })} />
              </div>
              <div className="space-y-2">
                <Label>Soil Type</Label>
                <select
                  value={requestForm.soilType}
                  onChange={(e) => setRequestForm({ ...requestForm, soilType: e.target.value })}
                  className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm text-foreground"
                >
                  {soilTypes.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Location</Label>
              <Input value={requestForm.location} onChange={(e) => setRequestForm({ ...requestForm, location: e.target.value })} placeholder="e.g. North field, Block A..." />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Input
                value={requestForm.description}
                onChange={(e) => {
                  const words = e.target.value.trim().split(/\s+/).filter(Boolean);
                  if (words.length <= 50) setRequestForm({ ...requestForm, description: e.target.value });
                }}
                placeholder="Brief description (max 50 words)..."
              />
            </div>
            <p className="text-xs text-muted-foreground">Status automatically set to <strong>Pending</strong>. Procurement will review and approve.</p>
            <Button type="submit" className="w-full gradient-primary text-black font-medium" disabled={requestMutation.isPending}>Submit Request</Button>
          </form>
        </DialogContent>
      </Dialog>
      )}

      {/* Edit Request Dialog */}
      {canEdit('land_parcels') && (
      <Dialog open={isEditRequestOpen} onOpenChange={setIsEditRequestOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Edit Parcel Request</DialogTitle></DialogHeader>
          <form onSubmit={(e) => {
            e.preventDefault();
            if (!editingRequest) return;
            editRequestMutation.mutate({
              id: editingRequest.id,
              data: {
                name: editReqForm.name,
                sizeHectares: editReqForm.sizeHectares || undefined,
                soilType: editReqForm.soilType,
                description: editReqForm.description || undefined,
                location: editReqForm.location || undefined,
              },
            });
          }} className="space-y-4">
            <div className="space-y-2">
              <Label>Parcel Name</Label>
              <Input value={editReqForm.name} onChange={(e) => setEditReqForm({ ...editReqForm, name: e.target.value })} required />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Size (Hectares)</Label>
                <Input type="number" step="0.01" min="0" value={editReqForm.sizeHectares} onChange={(e) => setEditReqForm({ ...editReqForm, sizeHectares: Number(e.target.value) })} />
              </div>
              <div className="space-y-2">
                <Label>Soil Type</Label>
                <select
                  value={editReqForm.soilType}
                  onChange={(e) => setEditReqForm({ ...editReqForm, soilType: e.target.value })}
                  className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm text-foreground"
                >
                  {soilTypes.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Location</Label>
              <Input value={editReqForm.location} onChange={(e) => setEditReqForm({ ...editReqForm, location: e.target.value })} placeholder="e.g. North field, Block A..." />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Input
                value={editReqForm.description}
                onChange={(e) => {
                  const words = e.target.value.trim().split(/\s+/).filter(Boolean);
                  if (words.length <= 50) setEditReqForm({ ...editReqForm, description: e.target.value });
                }}
                placeholder="Brief description (max 50 words)..."
              />
            </div>
            <Button type="submit" className="w-full gradient-primary text-black font-medium" disabled={editRequestMutation.isPending}>Save Changes</Button>
          </form>
        </DialogContent>
      </Dialog>
      )}

      {/* Assign Parcel Dialog */}
      {canEdit('land_parcels') && (
      <Dialog open={isAssignOpen} onOpenChange={setIsAssignOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Assign Land Parcel</DialogTitle></DialogHeader>
          <form onSubmit={(e) => {
            e.preventDefault();
            if (!assignForm.parcelId) return;
            assignMutation.mutate(assignForm);
          }} className="space-y-4">
            <div className="space-y-2">
              <Label>Select Parcel</Label>
              <select
                value={assignForm.parcelId}
                onChange={(e) => setAssignForm({ ...assignForm, parcelId: e.target.value })}
                className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm text-foreground"
                required
              >
                <option value="">Choose an inactive parcel...</option>
                {inactiveParcels.map(p => (
                  <option key={p.id} value={p.id}>{p.name} ({p.status})</option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label>Crop Name</Label>
              <Input
                value={assignForm.cropName}
                onChange={(e) => setAssignForm({ ...assignForm, cropName: e.target.value })}
                placeholder="e.g. Maize, Rice, Cassava..."
                required
              />
            </div>
            <div className="space-y-2">
              <Label>Set Status</Label>
              <select
                value={assignForm.status}
                onChange={(e) => setAssignForm({ ...assignForm, status: e.target.value })}
                className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm text-foreground"
              >
                <option value="active">active</option>
                <option value="preparation">preparation</option>
              </select>
            </div>
            <Button type="submit" className="w-full gradient-primary text-black font-medium" disabled={assignMutation.isPending}>Assign Parcel</Button>
          </form>
        </DialogContent>
      </Dialog>
      )}

      {/* Edit Inactive Parcel Dialog */}
      {canEdit('land_parcels') && (
      <Dialog open={isEditParcelOpen} onOpenChange={setIsEditParcelOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Edit Land Parcel</DialogTitle></DialogHeader>
          <form onSubmit={(e) => {
            e.preventDefault();
            if (!editingParcel) return;
            editParcelMutation.mutate({
              id: editingParcel.id,
              data: {
                name: editParcelForm.name,
                sizeHectares: editParcelForm.sizeHectares,
                soilType: editParcelForm.soilType,
                location: editParcelForm.location || undefined,
                status: editParcelForm.status,
                notes: editParcelForm.notes || undefined,
              },
            });
          }} className="space-y-4">
            <div className="space-y-2">
              <Label>Parcel Name</Label>
              <Input value={editParcelForm.name} onChange={(e) => setEditParcelForm({ ...editParcelForm, name: e.target.value })} required />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Size (Hectares)</Label>
                <Input type="number" step="0.01" min="0" value={editParcelForm.sizeHectares} onChange={(e) => setEditParcelForm({ ...editParcelForm, sizeHectares: Number(e.target.value) })} />
              </div>
              <div className="space-y-2">
                <Label>Soil Type</Label>
                <select
                  value={editParcelForm.soilType}
                  onChange={(e) => setEditParcelForm({ ...editParcelForm, soilType: e.target.value })}
                  className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm text-foreground"
                >
                  {soilTypes.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Location</Label>
              <Input value={editParcelForm.location} onChange={(e) => setEditParcelForm({ ...editParcelForm, location: e.target.value })} placeholder="e.g. North field, Block A..." />
            </div>
            <div className="space-y-2">
              <Label>Status</Label>
              <select
                value={editParcelForm.status}
                onChange={(e) => setEditParcelForm({ ...editParcelForm, status: e.target.value })}
                className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm text-foreground"
              >
                {['inactive', 'fallow', 'preparation', 'harvested'].map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div className="space-y-2">
              <Label>Notes</Label>
              <Input value={editParcelForm.notes} onChange={(e) => setEditParcelForm({ ...editParcelForm, notes: e.target.value })} placeholder="Optional notes..." />
            </div>
            <Button type="submit" className="w-full gradient-primary text-black font-medium" disabled={editParcelMutation.isPending}>Save Changes</Button>
          </form>
        </DialogContent>
      </Dialog>
      )}
    </DashboardLayout>
  );
}
