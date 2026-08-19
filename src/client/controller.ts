import { useSyncExternalStore } from "react";
import type { SettingsTabId } from "./settings-tabs.js";

export type UsageSurface = "closed" | "peek" | "dashboard";

export const SETTINGS_TAB_STORAGE_KEY = "usage-stats:settings-tab";
export const SETTINGS_OPEN_EVENT = "usage-stats:open-settings";

export interface UsageUiState {
	readonly surface: UsageSurface;
	readonly selectedProviderId: string | null;
	readonly pendingSettingsTab: SettingsTabId | null;
}

type Listener = () => void;

let state: UsageUiState = Object.freeze({ surface: "closed", selectedProviderId: null, pendingSettingsTab: null });
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
	requestSettingsTab(tab: SettingsTabId): void {
		try {
			sessionStorage.setItem(SETTINGS_TAB_STORAGE_KEY, tab);
		} catch {
			// ignore storage failures in restricted contexts
		}
		emit({ ...state, pendingSettingsTab: tab });
		if (typeof window !== "undefined") {
			window.dispatchEvent(new CustomEvent(SETTINGS_OPEN_EVENT, { detail: { tab } }));
		}
	},
	consumePendingSettingsTab(): SettingsTabId | null {
		const tab = state.pendingSettingsTab;
		if (tab === null) return null;
		emit({ ...state, pendingSettingsTab: null });
		return tab;
	},
	getSnapshot(): UsageUiState {
		return state;
	},
	subscribe,
});

export function useUsageUi(): UsageUiState {
	return useSyncExternalStore(subscribe, usageUiController.getSnapshot, usageUiController.getSnapshot);
}
