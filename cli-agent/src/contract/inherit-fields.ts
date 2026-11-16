import 'reflect-metadata';
import { FIELDS_KEY, type ParamDef } from '@kosolapus/plugin-ts-sdk';

/**
 * Merge parent FieldDecorator metadata into a child class so publication
 * sees shared ports plus the child's overrides (e.g. select model).
 */
export function inheritExecutorFields(
  Base: abstract new (...args: never[]) => unknown,
  Child: new (...args: never[]) => unknown,
): void {
  const parent =
    (Reflect.getMetadata(FIELDS_KEY, Base) as ParamDef[] | undefined) ?? [];
  const own =
    (Reflect.getMetadata(FIELDS_KEY, Child) as ParamDef[] | undefined) ?? [];
  const ownKeys = new Set(own.map((p) => p.key));
  Reflect.defineMetadata(
    FIELDS_KEY,
    [...parent.filter((p) => !ownKeys.has(p.key)), ...own],
    Child,
  );
}
