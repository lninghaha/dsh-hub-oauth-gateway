import { type AccountAdapterRegistry } from "./registry.js";
import type { AccountConfig, AccountSpec, ProviderDescriptor } from "./types.js";
export declare const COMPATIBILITY_ACCOUNT_PROVIDERS: readonly ProviderDescriptor[];
export declare function includeCompatibilityProviders(providers: readonly ProviderDescriptor[], compatibility?: boolean): ProviderDescriptor[];
export declare function resolveAccountSpec(provider: ProviderDescriptor, config: AccountConfig, registry: AccountAdapterRegistry): AccountSpec;
export declare function resolveAccountSpecs(providers: readonly ProviderDescriptor[], config: AccountConfig, registry: AccountAdapterRegistry, compatibility?: boolean): AccountSpec[];
//# sourceMappingURL=specs.d.ts.map