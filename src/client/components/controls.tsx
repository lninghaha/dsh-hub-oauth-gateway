/**
 * Settings controls aligned with the DSH official settings design language:
 * flat rows (16px vertical padding, `--dsw-alias-border-l2` separators,
 * 14px/22px titles) and 36px capsule controls on `--dsw-alias-bg-module-platform`,
 * matching the platform LanguageRow / AppearanceRow geometry.
 */

import type { ReactNode } from "react";

export function SettingsRow({
	title,
	hint,
	control,
	children,
}: {
	readonly title: string;
	readonly hint?: string;
	readonly control?: ReactNode;
	readonly children?: ReactNode;
}) {
	return (
		<div className="dus-row">
			<div className="dus-row-text">
				<div className="dus-row-title">{title}</div>
				{hint === undefined ? null : <div className="dus-row-hint">{hint}</div>}
				{children}
			</div>
			{control}
		</div>
	);
}

export function Toggle({
	checked,
	onChange,
	disabled = false,
	label,
}: {
	readonly checked: boolean;
	readonly onChange: (next: boolean) => void;
	readonly disabled?: boolean;
	readonly label: string;
}) {
	return (
		<button
			type="button"
			role="switch"
			aria-checked={checked}
			aria-label={label}
			className={`dus-toggle${checked ? " is-on" : ""}`}
			disabled={disabled}
			onClick={() => onChange(!checked)}
		>
			<span className="dus-toggle-thumb" />
		</button>
	);
}

export function SelectPill({
	value,
	onChange,
	options,
	ariaLabel,
	disabled = false,
}: {
	readonly value: string;
	readonly onChange: (next: string) => void;
	readonly options: readonly { value: string; label: string }[];
	readonly ariaLabel: string;
	readonly disabled?: boolean;
}) {
	return (
		<span className={`dus-select-pill${disabled ? " is-disabled" : ""}`}>
			<select
				aria-label={ariaLabel}
				value={value}
				disabled={disabled}
				onChange={(event) => onChange(event.target.value)}
			>
				{options.map((option) => (
					<option key={option.value} value={option.value}>
						{option.label}
					</option>
				))}
			</select>
			<svg className="dus-select-pill-chevron" width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
				<path d="M3.5 5.25 7 8.75l3.5-3.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
			</svg>
		</span>
	);
}

export function TextInput({
	value,
	onChange,
	placeholder,
	ariaLabel,
	type = "text",
	maxLength,
	disabled = false,
}: {
	readonly value: string;
	readonly onChange: (next: string) => void;
	readonly placeholder?: string;
	readonly ariaLabel: string;
	readonly type?: "text" | "password";
	readonly maxLength?: number;
	readonly disabled?: boolean;
}) {
	return (
		<input
			className="dus-input"
			type={type}
			value={value}
			aria-label={ariaLabel}
			disabled={disabled}
			placeholder={placeholder}
			{...(maxLength === undefined ? {} : { maxLength })}
			onChange={(event) => onChange(event.target.value)}
		/>
	);
}
