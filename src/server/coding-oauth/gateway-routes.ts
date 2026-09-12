/**
 * Settings-facing routes for the opt-in local API gateway.
 * @module dsh-coding-subscription-oauth/gateway-routes
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import { authorizeCodingOAuthRequest, authorizeLoopbackSecretRequest } from "./authorize-request.js";
import type { CodingOAuthGatewayController, GatewaySettingsPatch } from "./gateway.js";
import { readJsonRequest, requestErrorStatus } from "./http-json.js";
import { GATEWAY_REVEAL_PATH, GATEWAY_ROTATE_PATH, GATEWAY_SETTINGS_PATH } from "./ids.js";
import { safeMessage } from "./redact.js";
import { LOOPBACK_OWNER_REQUEST_POLICY, type OwnerRequestPolicy } from "./web-origin.js";
import { registerWebRouteSetupAtomically } from "./web-routes.js";

export { GATEWAY_REVEAL_PATH, GATEWAY_ROTATE_PATH, GATEWAY_SETTINGS_PATH } from "./ids.js";

export interface GatewayRouteContext {
	readonly webServer: {
		register(route: {
			kind: "exact" | "prefix";
			path: string;
			handler: (req: IncomingMessage, res: ServerResponse) => void | Promise<void>;
		}): () => void;
	};
	effect(callback: () => () => void | Promise<void>, label?: string): unknown;
}

export function registerGatewayRoutes(
	ctx: GatewayRouteContext,
	controller: CodingOAuthGatewayController,
	ownerRequestPolicy: OwnerRequestPolicy = LOOPBACK_OWNER_REQUEST_POLICY,
): () => void {
	let dispose = (): void => undefined;
	ctx.effect(() => {
		dispose = registerWebRouteSetupAtomically(ctx.webServer, (webServer) => {
			webServer.register({
				kind: "exact",
				path: GATEWAY_SETTINGS_PATH,
				handler: (req, res) => handleGatewaySettings(req, res, controller, ownerRequestPolicy),
			});
			webServer.register({
				kind: "exact",
				path: GATEWAY_REVEAL_PATH,
				handler: (req, res) => handleGatewayReveal(req, res, controller, ownerRequestPolicy),
			});
			webServer.register({
				kind: "exact",
				path: GATEWAY_ROTATE_PATH,
				handler: (req, res) => handleGatewayRotate(req, res, controller, ownerRequestPolicy),
			});
		});
		return dispose;
	}, "dsh-coding-subscription-oauth: gateway settings routes");
	return () => dispose();
}

async function handleGatewaySettings(
	req: IncomingMessage,
	res: ServerResponse,
	controller: CodingOAuthGatewayController,
	ownerRequestPolicy: OwnerRequestPolicy,
): Promise<void> {
	if (!authorizeCodingOAuthRequest(req, ownerRequestPolicy).authorized) {
		json(res, 403, { error: "forbidden" });
		return;
	}
	try {
		if (req.method === "GET") {
			json(res, 200, await controller.status());
			return;
		}
		if (req.method === "PATCH") {
			const raw = await readJsonRequest(req);
			if (
				!raw ||
				typeof raw !== "object" ||
				Array.isArray(raw) ||
				!Object.keys(raw).length ||
				Object.keys(raw).some((key) => !["enabled", "port", "opencodeGoEnabled", "opencodeGoRoute"].includes(key))
			) {
				json(res, 400, { error: "Provide gateway settings fields" });
				return;
			}
			const status = await controller.applySettings(raw as GatewaySettingsPatch);
			json(res, 200, status);
			return;
		}
		json(res, 405, { error: "method not allowed" });
	} catch (error) {
		json(
			res,
			error instanceof Error && "status" in error && typeof error.status === "number"
				? error.status
				: requestErrorStatus(error, 500),
			{ error: safeMessage(error) },
		);
	}
}

async function handleGatewayReveal(
	req: IncomingMessage,
	res: ServerResponse,
	controller: CodingOAuthGatewayController,
	ownerRequestPolicy: OwnerRequestPolicy,
): Promise<void> {
	if (!authorizeLoopbackSecretRequest(req, ownerRequestPolicy).authorized) {
		json(res, 403, { error: "forbidden" });
		return;
	}
	if (req.method !== "POST") {
		json(res, 405, { error: "method not allowed" });
		return;
	}
	try {
		json(res, 200, await controller.revealKey());
	} catch (error) {
		json(res, requestErrorStatus(error, 500), { error: safeMessage(error) });
	}
}

async function handleGatewayRotate(
	req: IncomingMessage,
	res: ServerResponse,
	controller: CodingOAuthGatewayController,
	ownerRequestPolicy: OwnerRequestPolicy,
): Promise<void> {
	if (!authorizeLoopbackSecretRequest(req, ownerRequestPolicy).authorized) {
		json(res, 403, { error: "forbidden" });
		return;
	}
	if (req.method !== "POST") {
		json(res, 405, { error: "method not allowed" });
		return;
	}
	try {
		json(res, 200, await controller.rotateKey());
	} catch (error) {
		json(res, requestErrorStatus(error, 500), { error: safeMessage(error) });
	}
}

function json(res: ServerResponse, status: number, value: unknown): void {
	const body = Buffer.from(`${JSON.stringify(value)}\n`);
	res.writeHead(status, {
		"content-type": "application/json; charset=utf-8",
		"content-length": body.byteLength,
		"cache-control": "no-store",
	});
	res.end(body);
}
