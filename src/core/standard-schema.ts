/**
 * Structural copy of the Standard Schema v1 interface (https://standardschema.dev, MIT).
 * Types only: the core never depends on a validator package. Any zod, valibot or
 * arktype schema matches this shape.
 */
export interface StandardSchemaV1<Input = unknown, Output = Input> {
  readonly '~standard': StandardSchemaV1Props<Input, Output>;
}

export interface StandardSchemaV1Props<Input = unknown, Output = Input> {
  readonly version: 1;
  readonly vendor: string;
  readonly validate: (
    value: unknown,
    options?: StandardSchemaV1Options | undefined,
  ) => StandardSchemaV1Result<Output> | Promise<StandardSchemaV1Result<Output>>;
  readonly types?: StandardSchemaV1Types<Input, Output> | undefined;
}

export interface StandardSchemaV1Options {
  readonly libraryOptions?: Record<string, unknown> | undefined;
}

export type StandardSchemaV1Result<Output> =
  | { readonly value: Output; readonly issues?: undefined }
  | { readonly issues: ReadonlyArray<StandardSchemaV1Issue> };

export interface StandardSchemaV1Issue {
  readonly message: string;
  readonly path?: ReadonlyArray<PropertyKey | { readonly key: PropertyKey }> | undefined;
}

export interface StandardSchemaV1Types<Input = unknown, Output = Input> {
  readonly input: Input;
  readonly output: Output;
}

/** Input type of a Standard Schema. */
export type InferSchemaInput<S extends StandardSchemaV1> = NonNullable<
  S['~standard']['types']
>['input'];

/** Output type of a Standard Schema. */
export type InferSchemaOutput<S extends StandardSchemaV1> = NonNullable<
  S['~standard']['types']
>['output'];
