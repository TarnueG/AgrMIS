import { createContext, useContext, useState, ReactNode } from 'react';
import { ConfirmModal, ConfirmType } from '@/components/ui/ConfirmModal';

export interface ConfirmOptions {
  title?: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  type?: ConfirmType;
  onConfirm: () => void;
  onCancel?: () => void;
}

type ConfirmState = ConfirmOptions & { open: boolean };

interface ConfirmContextType {
  openConfirm: (options: ConfirmOptions) => void;
}

const ConfirmContext = createContext<ConfirmContextType>({ openConfirm: () => {} });

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<ConfirmState | null>(null);

  const openConfirm = (options: ConfirmOptions) => {
    setState({ ...options, open: true });
  };

  const handleConfirm = () => {
    state?.onConfirm();
    setState(null);
  };

  const handleCancel = () => {
    state?.onCancel?.();
    setState(null);
  };

  return (
    <ConfirmContext.Provider value={{ openConfirm }}>
      {children}
      {state && (
        <ConfirmModal
          open={state.open}
          title={state.title}
          message={state.message}
          confirmText={state.confirmText}
          cancelText={state.cancelText}
          type={state.type}
          onConfirm={handleConfirm}
          onCancel={handleCancel}
        />
      )}
    </ConfirmContext.Provider>
  );
}

export const useConfirm = () => useContext(ConfirmContext);
