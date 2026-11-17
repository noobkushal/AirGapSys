/**
 * Safe arithmetic evaluator: a small recursive-descent parser. No eval(), no Function().
 * Supports + - * / % ^, parentheses and unary minus.
 */
export function safeEvaluate(src: string): number {
  const s = src.replace(/\s+/g, '');
  if (!s) throw new Error('Empty expression');
  if (!/^[0-9+\-*/%^().]+$/.test(s)) throw new Error('Only numbers and + - * / % ^ ( ) are allowed');
  let i = 0;
  const peek = () => s[i];
  function number(): number {
    const m = /^\d*\.?\d+/.exec(s.slice(i));
    if (!m) throw new Error(`Unexpected "${s[i] ?? 'end'}" at position ${i + 1}`);
    i += m[0].length;
    return parseFloat(m[0]);
  }
  function primary(): number {
    if (peek() === '(') {
      i++;
      const v = expr();
      if (peek() !== ')') throw new Error('Missing closing parenthesis');
      i++;
      return v;
    }
    return number();
  }
  function unary(): number {
    if (peek() === '-') { i++; return -unary(); }
    if (peek() === '+') { i++; return unary(); }
    return primary();
  }
  function power(): number {
    const base = unary();
    if (peek() === '^') { i++; return Math.pow(base, power()); }
    return base;
  }
  function term(): number {
    let v = power();
    while (peek() === '*' || peek() === '/' || peek() === '%') {
      const op = s[i++];
      const r = power();
      if (op === '*') v *= r;
      else if (r === 0) throw new Error('Division by zero');
      else v = op === '/' ? v / r : v % r;
    }
    return v;
  }
  function expr(): number {
    let v = term();
    while (peek() === '+' || peek() === '-') {
      const op = s[i++];
      const r = term();
      v = op === '+' ? v + r : v - r;
    }
    return v;
  }
  const result = expr();
  if (i < s.length) throw new Error(`Unexpected "${s[i]}" at position ${i + 1}`);
  if (!Number.isFinite(result)) throw new Error('Result is not finite');
  return result;
}
