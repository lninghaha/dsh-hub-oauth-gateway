import type { IncomingMessage, ServerResponse } from "node:http";
export declare const MAX_JSON_BODY_BYTES: number;
export declare function isLoopbackAddress(address: unknown): boolean;
export declare function hostNameOf(value: unknown): string | null;
export declare function isLoopbackRequest(request: IncomingMessage): boolean;
export type BrowserContextGuardReason = "origin-opaque" | "origin-invalid" | "origin-non-loopback" | "origin-authority-mismatch" | "referer-opaque" | "referer-invalid" | "referer-non-loopback" | "referer-authority-mismatch" | "forwarded-authority-invalid" | "forwarded-proto-invalid" | "proxy-marker-missing" | "proxy-authority-missing" | "authority-invalid" | "authority-mismatch" | "cross-site-marker-missing" | "cross-site-corroboration-missing" | "browser-context-missing";
export interface BrowserContextGuardDecision {
    readonly accepted: boolean;
    readonly reason: BrowserContextGuardReason | null;
}
export declare function browserContextGuardDecision(request: IncomingMessage): BrowserContextGuardDecision;
export declare function passesBrowserContextGuard(request: IncomingMessage): boolean;
export declare function passesCsrfGuard(request: IncomingMessage): boolean;
export declare function writeJson(response: ServerResponse, status: number, value: unknown): void;
export declare function readJsonBody(request: IncomingMessage, response: ServerResponse, maxBytes?: number): Promise<unknown | undefined>;
//# sourceMappingURL=security.d.ts.map