import { useEffect, useRef, type ReactNode } from 'react';

interface Props {
  onClose: () => void;
  labelledBy: string;
  children: ReactNode;
}

export function Modal({ onClose, labelledBy, children }: Props) {
  const painelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const focoAnterior = document.activeElement as HTMLElement | null;
    const overflowOriginal = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    painelRef.current?.focus();

    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', aoTeclar);

    return () => {
      document.removeEventListener('keydown', aoTeclar);
      document.body.style.overflow = overflowOriginal;
      focoAnterior?.focus?.();
    };
  }, [onClose]);

  return (
    <div className="modal-fundo" onClick={onClose}>
      <div
        className="modal-painel"
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        ref={painelRef}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}
