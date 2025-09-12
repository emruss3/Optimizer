// src/utils/safeJson.ts
export function safeStringify(value: any, space = 2) {
  const seen = new WeakSet();
  return JSON.stringify(
    value,
    (k, v) => {
      if (typeof v === 'object' && v !== null) {
        if (seen.has(v)) return '[Circular]';
        seen.add(v);

        if (v instanceof Map) return Object.fromEntries(v);
        if (v instanceof Set) return Array.from(v);
      }
      return v;
    },
    space
  );
}