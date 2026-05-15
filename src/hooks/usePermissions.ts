import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';
import { useAuth } from './useAuth';

export interface SubsystemAccess {
  canView: boolean;
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
}

interface PermissionsResponse {
  role: string;
  permissions: Record<string, SubsystemAccess>;
}

interface CardPermissionsResponse {
  cardIds: string[];
}

const ADMIN_ROLES = new Set(['admin']);

export function usePermissions() {
  const { user } = useAuth();

  const { data, isLoading } = useQuery<PermissionsResponse>({
    queryKey: ['user-permissions', user?.id],
    queryFn: () => api.get('/auth/permissions'),
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });

  const { data: cardData, isLoading: cardsLoading } = useQuery<CardPermissionsResponse>({
    queryKey: ['user-card-permissions', user?.id],
    queryFn: () => api.get('/auth/card-permissions'),
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });

  const role = data?.role ?? user?.role ?? '';
  const isAdmin = ADMIN_ROLES.has(role.toLowerCase().trim());
  const perms = data?.permissions ?? {};
  const cardIdSet = new Set<string>(cardData?.cardIds ?? []);

  const canView = (subsystem: string): boolean =>
    isAdmin || (perms[subsystem]?.canView ?? false);

  const canCreate = (subsystem: string): boolean =>
    isAdmin || (perms[subsystem]?.canCreate ?? false);

  const canEdit = (subsystem: string): boolean =>
    isAdmin || (perms[subsystem]?.canEdit ?? false);

  const canDelete = (subsystem: string): boolean =>
    isAdmin || (perms[subsystem]?.canDelete ?? false);

  const canViewCard = (cardId: string): boolean =>
    isAdmin || cardIdSet.has(cardId);

  return {
    permissions: perms,
    role,
    isAdmin,
    canView,
    canCreate,
    canEdit,
    canDelete,
    canViewCard,
    isLoading: isLoading || cardsLoading,
  };
}
