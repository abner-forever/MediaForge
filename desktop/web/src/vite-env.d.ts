/// <reference types="vite/client" />

declare const __APP_VERSION__: string;
declare const __BUILD_TIME__: string;

interface PyWebViewApi {
  save_file(filename: string, content: string, mime_type?: string): Promise<boolean>;
}

interface Window {
  pywebview?: { api: PyWebViewApi };
}
