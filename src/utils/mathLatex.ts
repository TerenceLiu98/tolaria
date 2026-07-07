export function normalizeLatexSource(latex: string): string {
  if (!/\\\\[A-Za-z]/u.test(latex)) return latex

  return latex
    .replace(/\\\\(?=[A-Za-z])/gu, '\\')
    .replace(/\\([{}])/gu, '$1')
}
