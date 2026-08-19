export function parseNonNegativeNumber(value: string): number | null {
	if (value.trim() === "") return null;
	const parsed = Number(value);
	return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}
