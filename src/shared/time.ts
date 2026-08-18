import type { TimeGranularity } from "./domain.js";

interface DateParts {
	readonly year: number;
	readonly month: number;
	readonly day: number;
	readonly hour: number;
}

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatter(timeZone: string): Intl.DateTimeFormat {
	let value = formatters.get(timeZone);
	if (value === undefined) {
		value = new Intl.DateTimeFormat("en-CA", {
			timeZone,
			year: "numeric",
			month: "2-digit",
			day: "2-digit",
			hour: "2-digit",
			hourCycle: "h23",
		});
		formatters.set(timeZone, value);
	}
	return value;
}

function partsAt(epochMs: number, timeZone: string): DateParts {
	const values = Object.fromEntries(
		formatter(timeZone)
			.formatToParts(new Date(epochMs))
			.filter(({ type }) => type !== "literal")
			.map(({ type, value }) => [type, Number(value)]),
	) as Partial<Record<keyof DateParts, number>>;
	if (
		values.year === undefined ||
		values.month === undefined ||
		values.day === undefined ||
		values.hour === undefined
	) {
		throw new Error(`unable to resolve calendar parts for timezone ${timeZone}`);
	}
	return { year: values.year, month: values.month, day: values.day, hour: values.hour };
}

function pad(value: number): string {
	return String(value).padStart(2, "0");
}

function dateKey(parts: DateParts): string {
	return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}`;
}

function weekStart(parts: DateParts, weekStartsOn: 0 | 1 | 6): DateParts {
	const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
	const delta = (date.getUTCDay() - weekStartsOn + 7) % 7;
	date.setUTCDate(date.getUTCDate() - delta);
	return {
		year: date.getUTCFullYear(),
		month: date.getUTCMonth() + 1,
		day: date.getUTCDate(),
		hour: 0,
	};
}

export function bucketKey(
	epochMs: number,
	timeZone: string,
	granularity: TimeGranularity,
	weekStartsOn: 0 | 1 | 6 = 1,
): string {
	const parts = partsAt(epochMs, timeZone);
	switch (granularity) {
		case "hour":
			return `${dateKey(parts)}T${pad(parts.hour)}`;
		case "day":
			return dateKey(parts);
		case "week":
			return dateKey(weekStart(parts, weekStartsOn));
		case "month":
			return `${parts.year}-${pad(parts.month)}`;
	}
}

function localPartsFromKey(key: string, granularity: TimeGranularity): DateParts {
	if (granularity === "month") {
		const match = /^(\d{4})-(\d{2})$/.exec(key);
		if (match === null) throw new Error(`invalid month bucket key ${key}`);
		return { year: Number(match[1]), month: Number(match[2]), day: 1, hour: 0 };
	}
	const match = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}))?$/.exec(key);
	if (match === null) throw new Error(`invalid bucket key ${key}`);
	return {
		year: Number(match[1]),
		month: Number(match[2]),
		day: Number(match[3]),
		hour: Number(match[4] ?? 0),
	};
}

export function bucketTimestamp(key: string, timeZone: string, granularity: TimeGranularity): number {
	const desired = localPartsFromKey(key, granularity);
	const desiredAsUtc = Date.UTC(desired.year, desired.month - 1, desired.day, desired.hour);
	let candidate = desiredAsUtc;
	for (let attempt = 0; attempt < 4; attempt += 1) {
		const actual = partsAt(candidate, timeZone);
		const actualAsUtc = Date.UTC(actual.year, actual.month - 1, actual.day, actual.hour);
		const adjustment = desiredAsUtc - actualAsUtc;
		candidate += adjustment;
		if (adjustment === 0) return candidate;
	}
	return candidate;
}

/** Shift a YYYY-MM-DD calendar key by whole days (timezone-independent once keyed). */
export function shiftDayKey(dayKey: string, deltaDays: number): string {
	const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dayKey);
	if (match === null) throw new Error(`invalid day key ${dayKey}`);
	const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]) + deltaDays));
	return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

export function enumerateDayKeys(fromDayKey: string, toDayKeyInclusive: string): string[] {
	const keys: string[] = [];
	let current = fromDayKey;
	for (let guard = 0; guard < 4000; guard += 1) {
		keys.push(current);
		if (current === toDayKeyInclusive) return keys;
		current = shiftDayKey(current, 1);
		if (current > toDayKeyInclusive) break;
	}
	return keys;
}
