import { afterEach } from 'node:test';
// Prisma delegates are proxies whose descriptors have no function value.
// Replace only the external database boundary and restore after every test.
const restores: (() => void)[] = [];
export function stubMethod(target: any, name: string, replacement: (...args: any[]) => any) {
  const original = target[name];
  target[name] = replacement;
  restores.push(() => { target[name] = original; });
}
export function restoreMethods() { for (const restore of restores.splice(0).reverse()) restore(); }
afterEach(restoreMethods);
