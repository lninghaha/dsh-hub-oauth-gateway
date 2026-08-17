/**
 * OAuth Device Authorization Grant framework (RFC 8628) for providers that
 * support it; currently GitHub Copilot.
 * The token is stored through the Harness credential seam and never logged.
 */
import type { AccountDeps, CredentialResolver } from "../types.js";
export interface DeviceFlowProvider {
    readonly id: string;
    readonly ref: string;
    readonly deviceCodeUrl: string;
    readonly tokenUrl: string;
    readonly clientId: string;
    readonly scope: string;
}
export interface DeviceCode {
    readonly deviceCode: string;
    readonly userCode: string;
    readonly verificationUri: string;
    readonly expiresIn: number;
    readonly interval: number;
}
export interface DeviceFlowResult {
    readonly ok: boolean;
    readonly ref?: string;
    readonly error?: string;
    readonly userCode: string;
    readonly verificationUri: string;
}
/** Request a device code from the provider. */
export declare function requestDeviceCode(providerId: string, deps?: AccountDeps): Promise<DeviceCode>;
/**
 * Poll the token endpoint once. Returns the access token if authorized,
 * null if still pending, or throws on terminal errors.
 */
export declare function pollTokenOnce(providerId: string, deviceCode: string, deps?: AccountDeps): Promise<string | null>;
/**
 * Run the full device flow: request code → poll until complete or timeout.
 * For the plugin, the UI may instead call `requestDeviceCode` once and drive
 * `pollTokenOnce` in a loop.
 */
export declare function runDeviceFlow(providerId: string, credentials: CredentialResolver | undefined, deps?: AccountDeps): Promise<DeviceFlowResult>;
/** List provider ids that support the device flow. */
export declare function supportedDeviceFlowProviders(): string[];
/** Get the credential ref for a device-flow provider. */
export declare function deviceFlowCredentialRef(providerId: string): string | null;
//# sourceMappingURL=oauth-device.d.ts.map