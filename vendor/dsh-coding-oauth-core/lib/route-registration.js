/**
 * DSH-neutral coordination for imperative route-like registrations.
 *
 * Registries often have no transaction boundary: a later registration can
 * fail after earlier entries are already live. These helpers make that setup
 * atomic by releasing successful registrations in reverse order.
 */
/** Release every disposer in reverse order, even when one cleanup fails. */
export async function releaseRegistrations(disposers) {
    for (const dispose of [...disposers].reverse()) {
        try {
            await dispose();
        }
        catch {
            // Cleanup is best-effort; later siblings must never be stranded.
        }
    }
}
function releaseRegistrationsSynchronously(disposers) {
    for (const dispose of [...disposers].reverse()) {
        try {
            dispose();
        }
        catch {
            // Cleanup is best-effort; later siblings must never be stranded.
        }
    }
}
function onceAsync(disposers) {
    let release;
    return () => {
        release ??= releaseRegistrations(disposers);
        return release;
    };
}
function onceSynchronously(disposers) {
    let disposed = false;
    return () => {
        if (disposed)
            return;
        disposed = true;
        releaseRegistrationsSynchronously(disposers);
    };
}
/** Register a declarative entry list atomically, including async disposers. */
export async function registerAtomically(registry, entries) {
    const disposers = [];
    try {
        for (const entry of entries)
            disposers.push(registry.register(entry));
    }
    catch (error) {
        await releaseRegistrations(disposers);
        throw error;
    }
    return onceAsync(disposers);
}
/** Track an imperative setup atomically, including async setup and disposers. */
export async function setupAtomically(registry, setup) {
    const disposers = [];
    const tracked = {
        register(entry) {
            const disposer = registry.register(entry);
            disposers.push(disposer);
            return disposer;
        },
    };
    try {
        await setup(tracked);
    }
    catch (error) {
        await releaseRegistrations(disposers);
        throw error;
    }
    return onceAsync(disposers);
}
/**
 * Synchronous compatibility form for hosts whose register contract only
 * permits synchronous disposers. The async APIs above are required when a
 * host owns async cleanup.
 */
export function registerAtomicallySynchronously(registry, entries) {
    const disposers = [];
    try {
        for (const entry of entries)
            disposers.push(registry.register(entry));
    }
    catch (error) {
        releaseRegistrationsSynchronously(disposers);
        throw error;
    }
    return onceSynchronously(disposers);
}
/** Synchronous compatibility form for imperative setup. */
export function setupAtomicallySynchronously(registry, setup) {
    const disposers = [];
    const tracked = {
        register(entry) {
            const disposer = registry.register(entry);
            disposers.push(disposer);
            return disposer;
        },
    };
    try {
        setup(tracked);
    }
    catch (error) {
        releaseRegistrationsSynchronously(disposers);
        throw error;
    }
    return onceSynchronously(disposers);
}
//# sourceMappingURL=route-registration.js.map