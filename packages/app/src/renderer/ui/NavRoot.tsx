import type { KeyboardEvent, ReactNode } from 'react';

export function navElements(root: ParentNode): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>('[data-nav]')).filter(
    (el) => !(el as HTMLInputElement).disabled && el.getAttribute('aria-hidden') !== 'true',
  );
}

/** Move focus to the next [data-nav] element after `from`. Returns false when `from` was the last one. */
export function focusNextNav(from: HTMLElement): boolean {
  const root = from.closest('[data-nav-root]') ?? document;
  const nav = navElements(root);
  const i = nav.indexOf(from);
  const next = nav[i + 1];
  if (i < 0 || !next) return false;
  next.focus();
  return true;
}

/** Makes Enter act like Tab inside a form. On the very last field it calls `onLast` instead. */
export function NavRoot({ onLast, children, className }: { onLast?: () => void; children: ReactNode; className?: string }) {
  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key !== 'Enter' || e.defaultPrevented) return;
    const target = e.target as HTMLElement;
    if (!target.hasAttribute('data-nav') || target.tagName === 'TEXTAREA') return;
    e.preventDefault();
    if (!focusNextNav(target)) onLast?.();
  }
  return (
    <div data-nav-root className={className} onKeyDown={onKeyDown}>
      {children}
    </div>
  );
}
