import { DEFAULT_CONFIG, type AppConfig, type SaveFileArgs } from '../../shared/bridge';
import type { AppBridge } from '../session/deps';

export interface FakeBridge extends AppBridge {
  saved: SaveFileArgs[];
  pdfs: string[];
  readonly config: AppConfig;
}

export function createFakeBridge(
  initial: Partial<AppConfig> = {},
  hooks: { onSetConfig?: (patch: Partial<AppConfig>) => void } = {},
): FakeBridge {
  let config: AppConfig = { ...DEFAULT_CONFIG, ...initial };
  const saved: SaveFileArgs[] = [];
  const pdfs: string[] = [];
  return {
    saved,
    pdfs,
    get config() {
      return config;
    },
    getConfig: async () => ({ ...config }),
    setConfig: async (patch) => {
      hooks.onSetConfig?.(patch);
      config = { ...config, ...patch };
      return { ...config };
    },
    saveFile: async (args) => {
      saved.push(args);
      return true;
    },
    printToPdf: async (args) => {
      pdfs.push(args.suggestedName);
      return true;
    },
  };
}
