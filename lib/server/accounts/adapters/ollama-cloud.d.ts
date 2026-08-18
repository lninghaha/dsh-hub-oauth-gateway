/**
 * Optional Ollama Cloud session/weekly quota via cookie credential.
 * Requires explicit `allowCookieSession: true` and a pinned `ollama.com` host.
 */
import type { AccountAdapter, RawQuotaWindow } from "../types.js";
export declare const OLLAMA_CLOUD_COOKIE_REF = "OLLAMA_CLOUD_SESSION";
export declare const OLLAMA_CLOUD_HOST = "https://ollama.com";
export declare function parseOllamaCloud(body: unknown): {
    plan: string;
    windows: RawQuotaWindow[];
};
export declare const ollamaCloudAdapter: AccountAdapter;
//# sourceMappingURL=ollama-cloud.d.ts.map