import {
	Field,
	FieldError,
	FieldLabel,
} from "@SchedulesManager/ui/components/field";
import { Input } from "@SchedulesManager/ui/components/input";
import { useState } from "react";

/** A shadcn field that reports blank or whitespace-only names on submit. */
export function RequiredTextField({
	id,
	label,
	value,
	onValueChange,
	placeholder,
	autoFocus,
	className,
	type = "text",
}: {
	id: string;
	label: string;
	value: string;
	onValueChange: (value: string) => void;
	placeholder?: string;
	autoFocus?: boolean;
	className?: string;
	type?: "text" | "email" | "url";
}) {
	const [hasSubmittedInvalid, setHasSubmittedInvalid] = useState(false);
	const invalid = hasSubmittedInvalid;
	const errorId = `${id}-error`;
	const errorMessage =
		type === "email"
			? "Enter a valid email address."
			: type === "url"
				? "Enter a valid URL."
				: `Enter ${label.toLowerCase()}.`;

	return (
		<Field className={className} data-invalid={invalid}>
			<FieldLabel htmlFor={id}>{label}</FieldLabel>
			<Input
				id={id}
				type={type}
				value={value}
				onChange={(event) => {
					onValueChange(event.target.value);
					setHasSubmittedInvalid(false);
				}}
				onInvalid={() => setHasSubmittedInvalid(true)}
				placeholder={placeholder}
				autoFocus={autoFocus}
				required
				pattern={type === "text" ? ".*\\S.*" : undefined}
				aria-invalid={invalid}
				aria-describedby={invalid ? errorId : undefined}
			/>
			{invalid ? <FieldError id={errorId}>{errorMessage}</FieldError> : null}
		</Field>
	);
}
