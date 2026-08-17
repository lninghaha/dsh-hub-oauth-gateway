import { type PriceRule, PriceRuleSchema } from "../../shared/domain.js";
import type { UsageDatabase } from "../storage/database.js";

interface PriceRuleRow {
	id: string;
	provider_pattern: string;
	model_pattern: string;
	effective_from: number;
	currency: string;
	input_per_million: number | null;
	output_per_million: number | null;
	cache_read_per_million: number | null;
	cache_write_per_million: number | null;
	source: PriceRule["source"];
	updated_at: number;
}

function fromRow(row: PriceRuleRow): PriceRule {
	return PriceRuleSchema.parse({
		id: row.id,
		providerPattern: row.provider_pattern,
		modelPattern: row.model_pattern,
		effectiveFrom: row.effective_from,
		currency: row.currency,
		inputPerMillion: row.input_per_million,
		outputPerMillion: row.output_per_million,
		cacheReadPerMillion: row.cache_read_per_million,
		cacheWritePerMillion: row.cache_write_per_million,
		source: row.source,
		updatedAt: row.updated_at,
	});
}

export class PricingRepository {
	readonly #database: UsageDatabase;

	constructor(database: UsageDatabase) {
		this.#database = database;
	}

	list(): PriceRule[] {
		const rows = this.#database
			.prepare(`
				SELECT id, provider_pattern, model_pattern, effective_from, currency,
				input_per_million, output_per_million, cache_read_per_million, cache_write_per_million,
				source, updated_at
				FROM price_rules
				ORDER BY source DESC, provider_pattern, model_pattern, effective_from DESC
			`)
			.all() as unknown as PriceRuleRow[];
		return rows.map(fromRow);
	}

	upsert(rule: PriceRule): void {
		const value = PriceRuleSchema.parse(rule);
		this.#database
			.prepare(`
				INSERT INTO price_rules (
					id, provider_pattern, model_pattern, effective_from, currency,
					input_per_million, output_per_million, cache_read_per_million, cache_write_per_million,
					source, updated_at
				) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
				ON CONFLICT(id) DO UPDATE SET
					provider_pattern = excluded.provider_pattern,
					model_pattern = excluded.model_pattern,
					effective_from = excluded.effective_from,
					currency = excluded.currency,
					input_per_million = excluded.input_per_million,
					output_per_million = excluded.output_per_million,
					cache_read_per_million = excluded.cache_read_per_million,
					cache_write_per_million = excluded.cache_write_per_million,
					source = excluded.source,
					updated_at = excluded.updated_at
				WHERE price_rules.source != 'builtin' OR excluded.source = 'builtin'
			`)
			.run(
				value.id,
				value.providerPattern,
				value.modelPattern,
				value.effectiveFrom,
				value.currency,
				value.inputPerMillion,
				value.outputPerMillion,
				value.cacheReadPerMillion,
				value.cacheWritePerMillion,
				value.source,
				value.updatedAt,
			);
	}

	replaceUserRules(rules: readonly PriceRule[]): void {
		const values = rules.map((rule) => PriceRuleSchema.parse({ ...rule, source: "user" }));
		this.#database.transaction(() => {
			this.#database.prepare("DELETE FROM price_rules WHERE source = 'user'").run();
			for (const rule of values) this.upsert(rule);
		});
	}

	delete(id: string): boolean {
		const result = this.#database.prepare("DELETE FROM price_rules WHERE id = ? AND source != 'builtin'").run(id);
		return result.changes > 0;
	}
}
