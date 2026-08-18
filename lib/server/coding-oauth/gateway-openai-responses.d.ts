/**
 * OpenAI Responses API subset for the local gateway.
 * @module dsh-hub-oauth-gateway/server/coding-oauth/gateway-openai-responses
 */
import type { IncomingMessage, ServerResponse } from "node:http";
import { type GatewayBackend } from "./gateway-backend.js";
export declare function handleOpenAiResponses(req: IncomingMessage, res: ServerResponse, backend: GatewayBackend): Promise<void>;
//# sourceMappingURL=gateway-openai-responses.d.ts.map