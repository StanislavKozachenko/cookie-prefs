import { merge } from './cookie';
import type { PrefOptions } from './types';

/**
 * How a value maps to the DOM string written by `.reflect()`, shared with the inline
 * script: an object maps each valid raw value to its DOM string (enum, boolean),
 * `1` is a number, `0` (or absent) a string taken as is.
 */
export type Kind = Readonly<Record<string, string>> | 0 | 1;

/** Runtime state of a builder. Internal; never part of the public API. */
export interface Def {
  /** Raw (URI-decoded) cookie value to a value; `undefined` or a throw means invalid. */
  p(raw: string): unknown;
  /** Value to the raw cookie string. */
  s(value: unknown): string;
  /** Enum values. Public as `EnumPrefBuilder.values`. */
  values?: readonly string[];
  k?: Kind;
  /** Default value. */
  d?: unknown;
  o?: PrefOptions;
  /** Reflect targets. */
  r?: readonly string[];
  /** Enum value map for reflection. */
  m?: Readonly<Record<string, string>> | undefined;
}

/**
 * An immutable builder: every method returns a new one. Typed as `never` because the
 * public builder interfaces are enforced by `PrefFactory`, not by this helper.
 */
export const builder = (def: Def): never =>
  ({
    ...def,
    default: (d: unknown) => builder({ ...def, d }),
    options: (o: PrefOptions) => builder({ ...def, o: merge(def.o, o) }),
    reflect: (r: string | readonly string[], m?: Record<string, string>) =>
      builder({ ...def, r: ([] as string[]).concat(r), m }),
  }) as never;
