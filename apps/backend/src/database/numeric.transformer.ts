import { ValueTransformer } from 'typeorm';

/** numeric (Postgres) <-> number. TypeORM returns numeric columns as strings. */
export const NumericTransformer: ValueTransformer = {
  to: (value: number | null | undefined) =>
    value === null || value === undefined ? value : Number(value),
  from: (value: string | number | null | undefined) =>
    value === null || value === undefined ? value : Number(value),
};
