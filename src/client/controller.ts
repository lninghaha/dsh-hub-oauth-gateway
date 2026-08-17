import { useSyncExternalStore } from "react";

export type UsageSurface = "closed" | "peek" | "dashboard";

export interface UsageUiState {
	readonly surface: UsageSurface;
	readonly selectedProviderId: string | null;
}

type Listener = () => void;

let state: UsageUiState = Object.freeze({ surface: "closed", selectedProviderId: null });
const listeners = new Set<Listener>();

function emit(next: UsageUiState): void {
	if (Object.is(next, state)) return;
	state = Object.freeze(next);
	for (const listener of listeners) listener();
}

function subscribe(listener: Listener): () => void {
	listeners.add(listener);
	return () => listeners.delete(listener);
}

export const usageUiController = Object.freeze({
	openPeek(): void {
		emit({ ...state, surface: "peek" });
	},
	openDashboard(): void {
		emit({ ...state, surface: "dashboard" });
	},
	close(): void {
		emit({ ...state, surface: "closed" });
	},
	selectProvider(providerId: string | null): void {
		emit({ ...state, selectedProviderId: providerId });
	},
	getSnapshot(): UsageUiState {
		return state;
	},
	subscribe,
});

export function useUsageUi(): UsageUiState {
	return useSyncExternalStore(subscribe, usageUiController.getSnapshot, usageUiController.getSnapshot);
}
