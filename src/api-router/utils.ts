export type Serializable<T> = T extends string | number | boolean | null | undefined
  ? T
  : T extends { toJSON: () => infer U }
    ? Serializable<U>
    : T extends Date | bigint
      ? string
      : T extends Array<infer U>
        ? Serializable<U>[]
        : T extends object
          ? { [K in keyof T]: Serializable<T[K]> }
          : T extends ((...args: unknown[]) => unknown) | symbol
            ? never
            : unknown;
export function toSerializable<T>(value: T): Serializable<T> {
  switch (typeof value) {
    case 'object':
      if (!value) {
        return value as Serializable<T>;
      }

      if ('toJSON' in value && typeof value.toJSON === 'function') {
        return toSerializable(value.toJSON());
      }

      if (Array.isArray(value)) {
        return value.map(toSerializable) as Serializable<T>;
      }

      if (value instanceof Date) {
        return value.toISOString() as Serializable<T>;
      }

      const result: Record<string, Serializable<any>> = {};
      for (const key in value) {
        if (Object.prototype.hasOwnProperty.call(value, key)) {
          result[key] = toSerializable(value[key]);
        }
      }

      return result as Serializable<T>;
    case 'bigint':
      return value.toString() as Serializable<T>;
    case 'function':
    case 'symbol':
      return undefined as Serializable<T>;
    default:
      return value as Serializable<T>;
  }
}
