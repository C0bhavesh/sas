import type { InputHTMLAttributes } from 'react';
import { normalizeAmount } from './format';

/** Keep digits and at most one dot, with at most two decimals. */
function sanitize(raw: string): string {
  let s = raw.replace(/[^0-9.]/g, '');
  const dot = s.indexOf('.');
  if (dot >= 0) s = s.slice(0, dot + 1) + s.slice(dot + 1).replace(/\./g, '').slice(0, 2);
  return s;
}

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type'> & {
  value: string;
  onChange: (value: string) => void;
  label: string;
  /** Set to false to leave this field out of Enter-key navigation (it can still be reached with Tab). */
  nav?: boolean;
};

export function MoneyInput({ value, onChange, label, nav = true, className, ...rest }: Props) {
  return (
    <input
      {...rest}
      data-nav={nav ? '' : undefined}
      inputMode="decimal"
      autoComplete="off"
      aria-label={label}
      className={`money ${className ?? ''}`.trim()}
      value={value}
      onFocus={(e) => e.currentTarget.select()}
      onChange={(e) => onChange(sanitize(e.target.value))}
      onBlur={() => {
        const normalized = normalizeAmount(value);
        if (normalized !== value) onChange(normalized);
      }}
    />
  );
}
