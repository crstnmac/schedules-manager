import { Input } from "@SchedulesManager/ui/components/input";
import { cn } from "@SchedulesManager/ui/lib/utils";
import { ChevronDownIcon } from "lucide-react";
import {
	useEffect,
	useId,
	useLayoutEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { createPortal } from "react-dom";

import {
	filterTimeZoneOptions,
	groupTimeZones,
	timeZoneOptions,
	timezoneLabel,
} from "@/lib/timezones";

const LIST_GAP = 4;
const LIST_MAX = 288;

type ListBox = {
	top: number;
	left: number;
	width: number;
	maxHeight: number;
};

function listBoxForTrigger(trigger: HTMLElement): ListBox {
	const rect = trigger.getBoundingClientRect();
	const below = window.innerHeight - rect.bottom - LIST_GAP;
	const above = rect.top - LIST_GAP;
	const openBelow = below >= 160 || below >= above;
	const available = Math.max(0, openBelow ? below : above);
	const maxHeight = Math.min(LIST_MAX, available);
	return {
		left: rect.left,
		width: rect.width,
		maxHeight,
		top: openBelow
			? rect.bottom + LIST_GAP
			: Math.max(LIST_GAP, rect.top - LIST_GAP - maxHeight),
	};
}

export function TimezoneSelect({
	id,
	value,
	onValueChange,
}: {
	id?: string;
	value: string;
	onValueChange: (value: string) => void;
}) {
	const listId = useId();
	const rootRef = useRef<HTMLDivElement>(null);
	const listRef = useRef<HTMLDivElement>(null);
	const [open, setOpen] = useState(false);
	const [query, setQuery] = useState("");
	const [activeIndex, setActiveIndex] = useState(0);
	const [box, setBox] = useState<ListBox | null>(null);

	const options = useMemo(() => timeZoneOptions(value), [value]);
	const matches = useMemo(
		() => filterTimeZoneOptions(query, options),
		[query, options],
	);
	const groups = useMemo(() => groupTimeZones(matches), [matches]);

	useLayoutEffect(() => {
		if (!open) {
			setBox(null);
			return;
		}
		function update() {
			const trigger = rootRef.current;
			if (!trigger) return;
			setBox(listBoxForTrigger(trigger));
		}
		update();
		window.addEventListener("resize", update);
		window.addEventListener("scroll", update, true);
		return () => {
			window.removeEventListener("resize", update);
			window.removeEventListener("scroll", update, true);
		};
	}, [open]);

	useEffect(() => {
		function onPointerDown(event: PointerEvent) {
			const target = event.target as Node;
			if (
				rootRef.current?.contains(target) ||
				listRef.current?.contains(target)
			) {
				return;
			}
			setOpen(false);
			setQuery("");
		}
		document.addEventListener("pointerdown", onPointerDown);
		return () => document.removeEventListener("pointerdown", onPointerDown);
	}, []);

	function select(zoneId: string) {
		onValueChange(zoneId);
		setOpen(false);
		setQuery("");
	}

	const active = matches[activeIndex];

	return (
		<div ref={rootRef} className="relative">
			<Input
				id={id}
				role="combobox"
				aria-autocomplete="list"
				aria-expanded={open}
				aria-controls={listId}
				autoComplete="off"
				spellCheck={false}
				value={open ? query : timezoneLabel(value)}
				placeholder="Search time zones"
				className="pr-7"
				onFocus={() => {
					setOpen(true);
					setQuery("");
				}}
				onChange={(event) => {
					setOpen(true);
					setQuery(event.target.value);
					setActiveIndex(0);
				}}
				onKeyDown={(event) => {
					if (event.key === "Escape") {
						setOpen(false);
						setQuery("");
						(event.currentTarget as HTMLInputElement).blur();
						return;
					}
					if (!open || matches.length === 0) return;
					if (event.key === "ArrowDown") {
						event.preventDefault();
						setActiveIndex((index) => (index + 1) % matches.length);
					} else if (event.key === "ArrowUp") {
						event.preventDefault();
						setActiveIndex(
							(index) => (index - 1 + matches.length) % matches.length,
						);
					} else if (event.key === "Enter") {
						event.preventDefault();
						if (active) select(active.id);
					}
				}}
			/>
			<ChevronDownIcon className="pointer-events-none absolute top-1/2 right-2 size-3.5 -translate-y-1/2 text-muted-foreground" />
			{open && box
				? createPortal(
						<div
							ref={listRef}
							id={listId}
							className="z-50 overflow-y-auto overscroll-contain rounded-md border bg-popover p-1 text-popover-foreground shadow-md"
							style={{
								position: "fixed",
								top: box.top,
								left: box.left,
								width: box.width,
								maxHeight: box.maxHeight,
							}}
						>
							{matches.length === 0 ? (
								<p className="px-2 py-1.5 text-muted-foreground">
									No time zones match that search.
								</p>
							) : (
								groups.map((group) => (
									<div key={group.region}>
										<p className="sticky top-0 z-10 bg-popover px-2 py-1 font-medium text-muted-foreground">
											{group.region}
										</p>
										{group.zones.map((option) => {
											const index = matches.findIndex(
												(match) => match.id === option.id,
											);
											return (
												<button
													key={option.id}
													type="button"
													className={cn(
														"flex w-full rounded-sm px-2 py-1.5 text-left text-xs hover:bg-muted/70",
														option.id === value && "bg-muted",
														index === activeIndex && "bg-muted",
													)}
													onMouseDown={(event) => event.preventDefault()}
													onMouseEnter={() => setActiveIndex(index)}
													onClick={() => select(option.id)}
												>
													{option.label}
												</button>
											);
										})}
									</div>
								))
							)}
						</div>,
						document.body,
					)
				: null}
		</div>
	);
}
