/**
 * Centralized security seams for the account-monitor subsystem.
 *
 * Everything that decides *where* a monitor request may go lives here:
 * private/loopback IP classification (IPv4 + IPv6), hostname policy,
 * DNS-answer validation, cross-origin and scheme rules, declarative-config
 * path/pointer validation, and the sensitive-header denylist. Loopback and
 * private-network targets stay reachable only behind explicit opt-ins so the
 * local-privacy assumptions of the host are preserved by default.
 */
import type { AccountDeps } from "./types.js";
/** Headers a declarative monitor config may never set literally. */
export declare const SENSITIVE_HEADERS: ReadonlySet<string>;
/** True for loopback, private, link-local, documentation, multicast, and other non-public IP space. */
export declare function isPrivateAddress(address: unknown): boolean;
/** True for localhost names and literal private addresses. */
export declare function isPrivateHostname(hostname: string): boolean;
/** Declarative request paths must be origin-relative absolute paths. */
export declare function assertRelativePath(path: unknown, label: string): asserts path is string;
/** Validate every pointer field of a declarative extract block. */
export declare function validateExtractPointers(extract: Record<string, unknown>, label: string): void;
/** RFC 6901 JSON Pointer lookup; missing paths return undefined. */
export declare function jsonPointer(value: unknown, pointer: unknown): unknown;
/** Resolve a declarative field mapping (pointer with optional divisor). */
export declare function mapped(root: unknown, mapping: unknown): unknown;
/** Network-target policy knobs derived from a validated monitor config. */
/** Network-target policy derived from a validated account spec. */
export type TargetPolicy = NonNullable<AccountDeps["targetPolicy"]>;
export interface ResolvedTarget {
    readonly url: URL;
    readonly address: string;
    readonly family: number;
}
/**
 * Validate a request target against scheme, credential, cross-origin, and
 * private-network policy, returning the DNS-pinned address to connect to.
 */
export declare function assertTargetPolicy(rawUrl: string, policy: TargetPolicy, deps: AccountDeps): Promise<ResolvedTarget>;
//# sourceMappingURL=security.d.ts.map