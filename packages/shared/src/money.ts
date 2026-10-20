export type Paise = bigint;

const AMOUNT_RE = /^-?\d+(\.\d{1,2})?$/;

/** Parse a decimal string such as "123.45" into paise. Throws on anything else. */
export function toPaise(input: string): Paise {
  const s = input.trim();
  if (!AMOUNT_RE.test(s)) throw new Error(`Invalid amount: "${input}"`);
  const neg = s.startsWith('-');
  const [whole, frac = ''] = (neg ? s.slice(1) : s).split('.');
  const paise = BigInt(whole) * 100n + BigInt(frac.padEnd(2, '0'));
  return neg ? -paise : paise;
}

/** Format paise as a decimal string with exactly two decimals. */
export function fromPaise(p: Paise): string {
  const neg = p < 0n;
  const abs = neg ? -p : p;
  const whole = abs / 100n;
  const frac = (abs % 100n).toString().padStart(2, '0');
  return `${neg ? '-' : ''}${whole}.${frac}`;
}

export function sumPaise(values: Paise[]): Paise {
  return values.reduce((a, b) => a + b, 0n);
}

/** Round to whole rupees, half away from zero. */
export function roundToRupee(p: Paise): Paise {
  const neg = p < 0n;
  const abs = neg ? -p : p;
  const rounded = ((abs + 50n) / 100n) * 100n;
  return neg ? -rounded : rounded;
}
