import * as React from "react";

import { cn } from "@/lib/utils";

function numberInputText(value: React.ComponentProps<"input">["value"]): string {
	if (value === undefined || value === null || value === "") return "";
	const text = String(value);
	const numericValue = Number(text);
	return !Number.isFinite(numericValue) || numericValue === 0 ? "" : text;
}

function NumberInput({
	className,
	value,
	onChange,
	onFocus,
	onBlur,
	placeholder,
	...props
}: React.ComponentProps<"input">) {
	const [isEditing, setIsEditing] = React.useState(false);
	const [draft, setDraft] = React.useState(() => numberInputText(value));

	// 2026-10-21: 親が Number(空欄) を 0 に変換しても、編集中は入力文字列を保つ。
	// 0 は置き換えやすく空欄で表示し、フォーカスを外したら確定値へ同期する。
	React.useEffect(() => {
		if (!isEditing) setDraft(numberInputText(value));
	}, [isEditing, value]);

	const isZero = value !== undefined && value !== null && value !== "" && Number(value) === 0;

	return (
		<input
			type="number"
			data-slot="input"
			className={cn(
				"flex w-full bg-input text-foreground border-border border-thick rounded-none px-[12px] py-[10px] font-mono text-[15px] transition-all outline-none",
				"placeholder:text-placeholder file:border-0 file:bg-transparent file:text-sm file:font-medium",
				"hover:bg-input-hover",
				"focus-visible:border-heavy focus-visible:ring-0",
				"aria-invalid:border-error aria-invalid:border-thick",
				"disabled:pointer-events-none disabled:border-border-disabled disabled:bg-input-disabled",
				className,
			)}
			{...props}
			value={isEditing ? draft : numberInputText(value)}
			placeholder={placeholder ?? (isZero ? "0" : undefined)}
			onFocus={(event) => {
				setDraft(numberInputText(value));
				setIsEditing(true);
				onFocus?.(event);
			}}
			onChange={(event) => {
				setDraft(event.currentTarget.value);
				onChange?.(event);
			}}
			onBlur={(event) => {
				onBlur?.(event);
				setIsEditing(false);
			}}
		/>
	);
}

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
	if (type === "number" && props.value !== undefined) {
		return <NumberInput className={className} value={props.value} {...props} />;
	}

	return (
		<input
			type={type}
			data-slot="input"
			className={cn(
				"flex w-full bg-input text-foreground border-border border-thick rounded-none px-[12px] py-[10px] font-mono text-[15px] transition-all outline-none",
				"placeholder:text-placeholder file:border-0 file:bg-transparent file:text-sm file:font-medium",
				"hover:bg-input-hover",
				"focus-visible:border-heavy focus-visible:ring-0",
				"aria-invalid:border-error aria-invalid:border-thick",
				"disabled:pointer-events-none disabled:border-border-disabled disabled:bg-input-disabled",
				className,
			)}
			{...props}
		/>
	);
}

export { Input };
