import { Dialog, DialogContent, DialogHeader, DialogTitle } from './dialog';
import { Button } from './button';
import { AlertTriangle, Trash2, CheckCircle, Info } from 'lucide-react';

export type ConfirmType = 'danger' | 'warning' | 'info' | 'success';

export interface ConfirmModalProps {
  open: boolean;
  title?: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  type?: ConfirmType;
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

const TYPE_CONFIG: Record<ConfirmType, { Icon: React.ElementType; iconBg: string; iconColor: string; btnClass: string }> = {
  danger:  { Icon: Trash2,         iconBg: 'bg-destructive/10', iconColor: 'text-destructive', btnClass: 'bg-destructive text-destructive-foreground hover:bg-destructive/90' },
  warning: { Icon: AlertTriangle,   iconBg: 'bg-warning/10',     iconColor: 'text-warning',     btnClass: 'gradient-primary text-black font-medium' },
  info:    { Icon: Info,            iconBg: 'bg-info/10',        iconColor: 'text-info',        btnClass: 'gradient-primary text-black font-medium' },
  success: { Icon: CheckCircle,     iconBg: 'bg-success/10',     iconColor: 'text-success',     btnClass: 'gradient-primary text-black font-medium' },
};

import React from 'react';

export function ConfirmModal({
  open, title, message, confirmText = 'Confirm', cancelText = 'Cancel',
  type = 'warning', loading, onConfirm, onCancel,
}: ConfirmModalProps) {
  const { Icon, iconBg, iconColor, btnClass } = TYPE_CONFIG[type];
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onCancel(); }}>
      <DialogContent className="max-w-sm" aria-describedby="confirm-modal-desc">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className={`h-10 w-10 rounded-full flex items-center justify-center shrink-0 ${iconBg}`}>
              <Icon className={`h-5 w-5 ${iconColor}`} aria-hidden="true" />
            </div>
            <DialogTitle>{title ?? 'Confirm'}</DialogTitle>
          </div>
        </DialogHeader>
        <p id="confirm-modal-desc" className="text-sm text-muted-foreground leading-relaxed">
          {message}
        </p>
        <div className="flex gap-3 justify-end mt-2">
          <Button
            variant="outline"
            className="border border-input bg-background text-white hover:bg-accent hover:text-accent-foreground"
            onClick={onCancel}
            disabled={loading}
            aria-label={cancelText}
          >
            {cancelText}
          </Button>
          <Button
            className={btnClass}
            onClick={onConfirm}
            disabled={loading}
            aria-label={confirmText}
          >
            {loading ? 'Processing…' : confirmText}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
