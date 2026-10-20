import { useEffect, useRef, type ReactNode } from 'react';

/** A modal box. Esc closes it and stops there, so the screen behind it does not also go back. */
export function Dialog({ title, onClose, children, width }: { title: string; onClose: () => void; children: ReactNode; width?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.querySelector<HTMLElement>('[data-autofocus], input, select, textarea, button')?.focus();
  }, []);
  return (
    <div className="overlay">
      <div
        ref={ref}
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        style={width ? { width } : undefined}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            onClose();
          }
        }}
      >
        <h2>{title}</h2>
        {children}
      </div>
    </div>
  );
}
