import type { ProviderDescriptor } from "../accounts/types.js";
export interface SettingsLike {
    get(namespace: string): unknown;
}
export declare function configuredProviders(settings: SettingsLike | undefined): Promise<readonly ProviderDescriptor[]>;
//# sourceMappingURL=providers.d.ts.map