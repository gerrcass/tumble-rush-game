import type { TumbleDebugApi } from './debug';

declare global {
  interface Window {
    __tumble?: TumbleDebugApi;
  }
}

export {};
