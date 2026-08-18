/**
 * Optional local-directory auto export. Never writes credentials or sessions.
 * Paths must be absolute; writes are refused outside the configured directory.
 */
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
export declare function validateAutoExportDirectory(directory: string): string;
export declare function assertPathInsideDirectory(directory: string, filePath: string): void;
export declare function writeAutoExportFile(directory: string, payload: AutoExportPayload, now?: number): Promise<string>;
export declare function isAutoExportAllowedInEnvironment(env?: NodeJS.ProcessEnv): boolean;
//# sourceMappingURL=auto-export.d.ts.map