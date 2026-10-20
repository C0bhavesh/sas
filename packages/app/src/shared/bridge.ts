export interface AppConfig {
  serverUrl: string;
  lastCompanyId?: string;
  lastYearId?: string;
}

export const DEFAULT_CONFIG: AppConfig = { serverUrl: 'http://127.0.0.1:4100' };

export interface RequestArgs {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  path: string;
  body?: unknown;
  token?: string | null;
}

/** `status` 0 means the server could not be reached. */
export interface RequestResult {
  status: number;
  json: unknown;
}

export interface SaveFileArgs {
  suggestedName: string;
  data: string;
  mime: string;
}

/** What the preload script exposes to the renderer as `window.sas`. */
export interface SasBridge {
  request(args: RequestArgs): Promise<RequestResult>;
  getConfig(): Promise<AppConfig>;
  setConfig(patch: Partial<AppConfig>): Promise<AppConfig>;
  saveFile(args: SaveFileArgs): Promise<boolean>;
  printToPdf(args: { suggestedName: string }): Promise<boolean>;
}
