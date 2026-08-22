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
export async function releaseRegistrations(disposers: Iterable<RegistrationDisposer>): Promise<void> {
	for (const dispose of [...disposers].reverse()) {
		try {
			await dispose();
		} catch {
			// Cleanup is best-effort; later siblings must never be stranded.
		}
	}
}

function releaseRegistrationsSynchronously(disposers: Iterable<SynchronousRegistrationDisposer>): void {
	for (const dispose of [...disposers].reverse()) {
		try {
			dispose();
		} catch {
			// Cleanup is best-effort; later siblings must never be stranded.
		}
	}
}

function onceAsync(disposers: readonly RegistrationDisposer[]): () => Promise<void> {
	let release: Promise<void> | undefined;
	return () => {
		release ??= releaseRegistrations(disposers);
		return release;
	};
}

function onceSynchronously(disposers: readonly SynchronousRegistrationDisposer[]): SynchronousRegistrationDisposer {
	let disposed = false;
	return () => {
		if (disposed) return;
		disposed = true;
		releaseRegistrationsSynchronously(disposers);
	};
}

/** Register a declarative entry list atomically, including async disposers. */
export async function registerAtomically<Entry>(
	registry: RegistrationRegistry<Entry>,
	entries: Iterable<Entry>,
): Promise<() => Promise<void>> {
	const disposers: RegistrationDisposer[] = [];
	try {
		for (const entry of entries) disposers.push(registry.register(entry));
	} catch (error) {
		await releaseRegistrations(disposers);
		throw error;
	}
	return onceAsync(disposers);
}

/** Track an imperative setup atomically, including async setup and disposers. */
export async function setupAtomically<Entry>(
	registry: RegistrationRegistry<Entry>,
	setup: (tracked: RegistrationRegistry<Entry>) => void | Promise<void>,
): Promise<() => Promise<void>> {
	const disposers: RegistrationDisposer[] = [];
	const tracked: RegistrationRegistry<Entry> = {
		register(entry) {
			const disposer = registry.register(entry);
			disposers.push(disposer);
			return disposer;
		},
	};
	try {
		await setup(tracked);
	} catch (error) {
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
export function registerAtomicallySynchronously<Entry>(
	registry: SynchronousRegistrationRegistry<Entry>,
	entries: Iterable<Entry>,
): SynchronousRegistrationDisposer {
	const disposers: SynchronousRegistrationDisposer[] = [];
	try {
		for (const entry of entries) disposers.push(registry.register(entry));
	} catch (error) {
		releaseRegistrationsSynchronously(disposers);
		throw error;
	}
	return onceSynchronously(disposers);
}

/** Synchronous compatibility form for imperative setup. */
export function setupAtomicallySynchronously<Entry>(
	registry: SynchronousRegistrationRegistry<Entry>,
	setup: (tracked: SynchronousRegistrationRegistry<Entry>) => unknown,
): SynchronousRegistrationDisposer {
	const disposers: SynchronousRegistrationDisposer[] = [];
	const tracked: SynchronousRegistrationRegistry<Entry> = {
		register(entry) {
			const disposer = registry.register(entry);
			disposers.push(disposer);
			return disposer;
		},
	};
	try {
		setup(tracked);
	} catch (error) {
		releaseRegistrationsSynchronously(disposers);
		throw error;
	}
	return onceSynchronously(disposers);
}
