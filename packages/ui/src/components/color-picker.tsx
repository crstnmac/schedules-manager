"use client";

import { cn } from "cn";
import { CheckIcon } from "lucide-react";
import { useState } from "react";
import { HexColorPicker } from "react-colorful";

import { Button } from "./button";
import { Input } from "./input";
import { Popover, PopoverContent, PopoverTrigger } from "./popover";

export const COLOR_PICKER_PRESETS = [
	"#ef4444",
	"#f97316",
	"#f59e0b",
	"#eab308",
	"#84cc16",
	"#22c55e",
	"#10b981",
	"#14b8a6",
	"#06b6d4",
	"#0ea5e9",
	"#3b82f6",
	"#6366f1",
	"#8b5cf6",
	"#a855f7",
	"#d946ef",
	"#ec4899",
	"#f43f5e",
	"#64748b",
] as const;

const HEX_PATTERN = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

function isHex(value: string): boolean {
	return HEX_PATTERN.test(value.trim());
}

/**
 * Popover color picker styled with the app primitives: a saturation/hue area
 * (react-colorful), a hex field, and preset swatches. An empty value means the
 * caller has not chosen a color.
 */
export function ColorPicker({
	value,
	onChange,
	presets = COLOR_PICKER_PRESETS,
	disabled,
	id,
	className,
	placeholder = "Pick a color",
	clearable = true,
}: {
	value: string;
	onChange: (value: string) => void;
	presets?: readonly string[];
	disabled?: boolean;
	id?: string;
	className?: string;
	placeholder?: string;
	clearable?: boolean;
}) {
	const [open, setOpen] = useState(false);
	const pickerColor = isHex(value) ? value : "#000000";

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger
				disabled={disabled}
				render={
					<Button
						type="button"
						variant="outline"
						id={id}
						data-empty={!value}
						className={cn(
							"w-full justify-start gap-2 font-normal data-[empty=true]:text-muted-foreground",
							className,
						)}
					/>
				}
			>
				<span
					className="size-4 shrink-0 rounded-full border"
					style={value ? { backgroundColor: value } : undefined}
				/>
				<span className="truncate font-mono uppercase">
					{value || placeholder}
				</span>
			</PopoverTrigger>
			<PopoverContent align="start" className="w-60 gap-3">
				<HexColorPicker
					color={pickerColor}
					onChange={onChange}
					style={{ width: "100%", height: 140 }}
				/>
				<div className="flex items-center gap-2">
					<span
						className="size-8 shrink-0 rounded-md border"
						style={{ backgroundColor: pickerColor }}
					/>
					<Input
						value={value}
						onChange={(event) => onChange(event.target.value)}
						placeholder="#000000"
						className="font-mono uppercase"
						maxLength={7}
						aria-label="Hex color"
					/>
				</div>
				<div className="grid grid-cols-9 gap-1.5">
					{presets.map((preset) => {
						const active = preset.toLowerCase() === value.trim().toLowerCase();
						return (
							<button
								key={preset}
								type="button"
								aria-label={preset}
								aria-pressed={active}
								className={cn(
									"relative size-5 rounded-md border transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
									active && "ring-2 ring-ring",
								)}
								style={{ backgroundColor: preset }}
								onClick={() => onChange(preset)}
							>
								{active ? (
									<CheckIcon className="absolute inset-0 m-auto size-3 text-white drop-shadow" />
								) : null}
							</button>
						);
					})}
				</div>
				{clearable && value ? (
					<Button
						type="button"
						variant="ghost"
						size="sm"
						className="justify-start text-muted-foreground"
						onClick={() => {
							onChange("");
							setOpen(false);
						}}
					>
						No color
					</Button>
				) : null}
			</PopoverContent>
		</Popover>
	);
}
