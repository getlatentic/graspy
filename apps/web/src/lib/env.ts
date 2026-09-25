/// <reference types="vite/client" />

// No defaults: a bundle that lost its .env.<mode> must not ship pointing at a developer's machine.
interface Env {
  readonly VITE_API_URL: string;
  readonly VITE_A2A_BASE: string;
}

const env = import.meta.env as unknown as Env;

export const API_BASE_URL = env.VITE_API_URL;

export const A2A_BASE_URL = env.VITE_A2A_BASE;
