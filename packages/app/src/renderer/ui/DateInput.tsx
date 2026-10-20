import { useEffect, useState, type InputHTMLAttributes } from 'react';
import { formatDisplay, parseDateInput, type DateCtx } from './dates';

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type'> & {
  value: string | null;
  onChange: (iso: string | null) => void;
  ctx: DateCtx;
  label: string;
};

export function DateInput({ value, onChange, ctx, label, ...rest }: Props) {
  const [text, setText] = useState(value ? formatDisplay(value) : '');
  const [invalid, setInvalid] = useState(false);

  useEffect(() => {
    setText(value ? formatDisplay(value) : '');
    setInvalid(false);
  }, [value]);

  /** Returns false when the text is not a readable date. */
  function commit(): boolean {
    if (text.trim() === '') {
      onChange(null);
      setInvalid(false);
      return true;
    }
    const iso = parseDateInput(text, ctx);
    if (!iso) {
      setInvalid(true);
      return false;
    }
    setInvalid(false);
    setText(formatDisplay(iso));
    onChange(iso);
    return true;
  }

  return (
    <input
      {...rest}
      data-nav=""
      autoComplete="off"
      placeholder="dd-mm-yyyy"
      aria-label={label}
      aria-invalid={invalid ? 'true' : undefined}
      value={text}
      onFocus={(e) => e.currentTarget.select()}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => void commit()}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && !commit()) {
          e.preventDefault();
          e.stopPropagation();
        }
      }}
      style={invalid ? { borderColor: 'var(--bad)', width: 120 } : { width: 120 }}
    />
  );
}
