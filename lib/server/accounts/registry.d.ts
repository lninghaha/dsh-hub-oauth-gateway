import type { AccountAdapter, ProviderDescriptor } from "./types.js";
export declare const BUILTIN_ACCOUNT_ADAPTERS: readonly AccountAdapter[];
export declare class AccountAdapterRegistry {
    #private;
    constructor(adapters?: readonly AccountAdapter[]);
    get(id: string | null | undefined): AccountAdapter | null;
    has(id: string): boolean;
    list(): readonly AccountAdapter[];
}
export declare function defaultAdapterId(provider: ProviderDescriptor): string | null;
//# sourceMappingURL=registry.d.ts.map