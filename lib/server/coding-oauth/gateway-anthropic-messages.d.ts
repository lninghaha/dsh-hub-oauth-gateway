/**
 * Anthropic Messages API subset for the local gateway.
 * @module dsh-hub-oauth-gateway/server/coding-oauth/gateway-anthropic-messages
 */
import type { IncomingMessage, ServerResponse } from "node:http";
import { type GatewayBackend } from "./gateway-backend.js";
export declare function handleAnthropicMessages(req: IncomingMessage, res: ServerResponse, backend: GatewayBackend): Promise<void>;
//# sourceMappingURL=gateway-anthropic-messages.d.ts.map