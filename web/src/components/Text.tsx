import type { ElementType, ReactNode } from 'react';

/**
 * Renders user-generated text. `dir="auto"` lets the browser pick direction from the
 * first strong character, which is what makes an Arabic question inside an English
 * interface — or an English name in an Arabic class list — lay out correctly (D-22).
 */
export function Text({ as: As = 'span', children, ...rest }:
  { as?: ElementType; children: ReactNode } & Record<string, unknown>) {
  return <As dir="auto" {...rest}>{children}</As>;
}
