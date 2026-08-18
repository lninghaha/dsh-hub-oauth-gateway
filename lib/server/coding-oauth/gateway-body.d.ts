/**
 * Shared JSON body reader for isolated gateway endpoints.
 * @module dsh-hub-oauth-gateway/server/coding-oauth/gateway-body
 */
import type { IncomingMessage } from "node:http";
export declare function readGatewayJsonBody(req: IncomingMessage): Promise<Record<string, unknown>>;
export declare function writeGatewayJson(res: import("node:http").ServerResponse, status: number, value: unknown): void;
export declare function beginGatewaySse(res: import("node:http").ServerResponse): void;
//# sourceMappingURL=gateway-body.d.ts.map