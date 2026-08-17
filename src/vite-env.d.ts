/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_DEFAULT_ENV?: string;
  readonly VITE_DEV_BACKEND_URL?: string;
  readonly VITE_DEV_AGENT_URL?: string;
  readonly VITE_UAT_BACKEND_URL?: string;
  readonly VITE_UAT_AGENT_URL?: string;
  readonly VITE_SIT_BACKEND_URL?: string;
  readonly VITE_SIT_AGENT_URL?: string;
  readonly VITE_PROD_BACKEND_URL?: string;
  readonly VITE_PROD_AGENT_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
