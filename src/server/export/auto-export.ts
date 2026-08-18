/**
 * Optional local-directory auto export. Never writes credentials or sessions.
 * Paths must be absolute; writes are refused outside the configured directory.
 */

import { mkdir, writeFile } from "node:fs/promises";
import { isAbsolute, resolve, sep } from "node:path";
import type { ExportLayout } from "../../shared/contracts.js";

export interface AutoExportPreferences {
	readonly enabled: boolean;
	readonly directory: string;
	readonly layout: ExportLayout;
	readonly intervalMinutes: number;
}

export interface AutoExportPayload {
	readonly generatedAt: number;
	readonly layout: ExportLayout;
	readonly body: string;
	readonly extension: "json" | "csv";
}

export function validateAutoExportDirectory(directory: string): string {
	const trimmed = directory.trim();
	if (trimmed === "") throw new Error("auto-export directory is required when enabled");
	if (!isAbsolute(trimmed)) throw new Error("auto-export directory must be an absolute path");
	if (trimmed.includes("\0")) throw new Error("auto-export directory is invalid");
	const resolved = resolve(trimmed);
	if (resolved !== trimmed && !trimmed.endsWith(sep) && resolve(trimmed) !== resolved) {
		/* still use resolved canonical form */
	}
	return resolved;
}

export function assertPathInsideDirectory(directory: string, filePath: string): void {
	const root = resolve(directory);
	const target = resolve(filePath);
	if (target !== root && !target.startsWith(root.endsWith(sep) ? root : `${root}${sep}`)) {
		throw new Error("auto-export path escapes the configured directory");
	}
}

export async function writeAutoExportFile(
	directory: string,
	payload: AutoExportPayload,
	now = Date.now(),
): Promise<string> {
	const root = validateAutoExportDirectory(directory);
	await mkdir(root, { recursive: true, mode: 0o700 });
	const stamp = new Date(now).toISOString().replace(/[:.]/g, "-");
	const fileName = `dsh-hub-oauth-gateway-auto-${payload.layout}-${stamp}.${payload.extension}`;
	const target = resolve(root, fileName);
	assertPathInsideDirectory(root, target);
	await writeFile(target, payload.body, { encoding: "utf8", mode: 0o600, flag: "wx" });
	return target;
}

export function isAutoExportAllowedInEnvironment(env: NodeJS.ProcessEnv = process.env): boolean {
	// Refuse inside the Docker sandbox / CI where DSH_HOME is the throwaway sandbox home.
	if (env.CI === "1" || env.CI === "true") return false;
	if ((env.DSH_HOME ?? "").includes("dsh-sandbox-home")) return false;
	return true;
}
