import { applyPreferenceOperations, type PreferencePathOperation, type UserPreferences } from "./preferences.js";

const sections = ["display", "providers", "privacy", "alerts"] as const;
const object = (value: unknown): value is Record<string, unknown> =>
	typeof value === "object" && value !== null && !Array.isArray(value);
const equal = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);

export function preferenceOperations(base: UserPreferences, draft: UserPreferences): PreferencePathOperation[] {
	const result: PreferencePathOperation[] = [];
	const visit = (before: unknown, after: unknown, path: string[]): void => {
		if (equal(before, after)) return;
		// HUD 坐标是一组可空值，和数组一样作为一个字段应用。
		if (object(before) && object(after) && path.join(".") !== "display.hudPosition") {
			for (const key of new Set([...Object.keys(before), ...Object.keys(after)]))
				visit(before[key], after[key], [...path, key]);
		} else result.push(after === undefined ? { op: "unset", path } : { op: "set", path, value: after });
	};
	for (const section of sections) visit(base[section], draft[section], [section]);
	return result;
}

function overlaps(a: readonly string[], b: readonly string[]): boolean {
	return a.every((key, i) => b[i] === key) || b.every((key, i) => a[i] === key);
}

/** 三方合并只重放本地修改；选择远端时也保留没有冲突的本地字段。 */
export function rebasePreferences(
	base: UserPreferences,
	draft: UserPreferences,
	latest: UserPreferences,
	choice: "local" | "latest" = "local",
) {
	const local = preferenceOperations(base, draft);
	const remote = preferenceOperations(base, latest);
	const conflicting = local.filter((op) => remote.some((other) => overlaps(op.path, other.path) && !equal(op, other)));
	return {
		conflicts: conflicting.map((op) => op.path.join(".")),
		preferences: applyPreferenceOperations(
			latest,
			choice === "local" ? local : local.filter((op) => !conflicting.includes(op)),
		),
	};
}

export function acknowledgePreferenceSave(
	submitted: UserPreferences,
	currentDraft: UserPreferences,
	saved: UserPreferences,
): UserPreferences {
	return applyPreferenceOperations(saved, preferenceOperations(submitted, currentDraft));
}
