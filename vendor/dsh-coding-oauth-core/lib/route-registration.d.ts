/**
 * DSH-neutral coordination for imperative route-like registrations.
 *
 * Registries often have no transaction boundary: a later registration can
 * fail after earlier entries are already live. These helpers make that setup
 * atomic by releasing successful registrations in reverse order.
 */
export type RegistrationDisposer = () => void | Promise<void>;
export type SynchronousRegistrationDisposer = () => void;
export interface RegistrationRegistry<Entry> {
    register(entry: Entry): RegistrationDisposer;
}
export interface SynchronousRegistrationRegistry<Entry> {
    register(entry: Entry): SynchronousRegistrationDisposer;
}
/** Release every disposer in reverse order, even when one cleanup fails. */
export declare function releaseRegistrations(disposers: Iterable<RegistrationDisposer>): Promise<void>;
/** Register a declarative entry list atomically, including async disposers. */
export declare function registerAtomically<Entry>(registry: RegistrationRegistry<Entry>, entries: Iterable<Entry>): Promise<() => Promise<void>>;
/** Track an imperative setup atomically, including async setup and disposers. */
export declare function setupAtomically<Entry>(registry: RegistrationRegistry<Entry>, setup: (tracked: RegistrationRegistry<Entry>) => void | Promise<void>): Promise<() => Promise<void>>;
/**
 * Synchronous compatibility form for hosts whose register contract only
 * permits synchronous disposers. The async APIs above are required when a
 * host owns async cleanup.
 */
export declare function registerAtomicallySynchronously<Entry>(registry: SynchronousRegistrationRegistry<Entry>, entries: Iterable<Entry>): SynchronousRegistrationDisposer;
/** Synchronous compatibility form for imperative setup. */
export declare function setupAtomicallySynchronously<Entry>(registry: SynchronousRegistrationRegistry<Entry>, setup: (tracked: SynchronousRegistrationRegistry<Entry>) => unknown): SynchronousRegistrationDisposer;
//# sourceMappingURL=route-registration.d.ts.map