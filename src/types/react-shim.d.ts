/**
 * SANDBOX-ONLY shim. The environment this was first built in had React but not
 * @types/react, so this file loosely types React to let `tsc` run over the rest of
 * the code. It is used only by tsconfig.sandbox.json. With real dependencies installed
 * (npm install), `npm run typecheck` uses @types/react and this file is ignored.
 */
declare module 'react' {
  export type ReactNode = any;
  export type CSSProperties = any;
  export type PointerEvent<T = any> = any;
  export type KeyboardEvent<T = any> = any;
  export type ChangeEvent<T = any> = any;
  export type MouseEvent<T = any> = any;
  export type FormEvent<T = any> = any;
  export type RefObject<T> = { current: T | null };
  export function useState<S>(init: S | (() => S)): [S, (v: S | ((p: S) => S)) => void];
  export function useEffect(fn: () => void | (() => void), deps?: readonly unknown[]): void;
  export function useLayoutEffect(fn: () => void | (() => void), deps?: readonly unknown[]): void;
  export function useMemo<T>(fn: () => T, deps: readonly unknown[]): T;
  export function useCallback<T extends (...a: any[]) => any>(fn: T, deps: readonly unknown[]): T;
  export function useRef<T>(init: T | null): { current: T };
  export function useId(): string;
  export function useReducer(...a: any[]): any;
  export function useSyncExternalStore<T>(sub: (cb: () => void) => () => void, get: () => T): T;
  export function createContext<T>(v: T): { _t: T; Provider: any };
  export function useContext<T>(c: { _t: T }): T;
  export const StrictMode: any;
  export const Fragment: any;
  const React: any;
  export default React;
}
declare module 'react/jsx-runtime' {
  export const jsx: any;
  export const jsxs: any;
  export const Fragment: any;
}
declare module 'react-dom/client' {
  export function createRoot(el: Element): { render(n: any): void };
}
declare namespace JSX {
  interface IntrinsicAttributes {
    key?: any;
  }
  interface IntrinsicElements {
    [tag: string]: {
      [prop: string]: any;
      onChange?: (e: any) => void;
      onInput?: (e: any) => void;
      onClick?: (e: any) => void;
      onKeyDown?: (e: any) => void;
      onFocus?: (e: any) => void;
      onBlur?: (e: any) => void;
      onSubmit?: (e: any) => void;
      onPointerDown?: (e: any) => void;
      onPointerMove?: (e: any) => void;
      onPointerUp?: (e: any) => void;
      onPointerCancel?: (e: any) => void;
    };
  }
  type Element = any;
}
