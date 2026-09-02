import { Button } from "@SchedulesManager/ui/components/button";
import { Input } from "@SchedulesManager/ui/components/input";
import { Spinner } from "@SchedulesManager/ui/components/spinner";
import { LocateFixedIcon } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { toast } from "sonner";

import { currentCoords } from "@/lib/coords";
import { type PlaceDto, reversePlace, usePlaceSearch } from "@/lib/queries";

export function AddressSearch({
	id,
	value,
	onValueChange,
	onSelect,
}: {
	id: string;
	value: string;
	onValueChange: (value: string) => void;
	onSelect: (place: PlaceDto) => void;
}) {
	const listId = useId();
	const rootRef = useRef<HTMLDivElement>(null);
	const [open, setOpen] = useState(false);
	const [debounced, setDebounced] = useState(value);
	const [activeIndex, setActiveIndex] = useState(0);
	const [locating, setLocating] = useState(false);
	const search = usePlaceSearch(debounced, open);

	useEffect(() => {
		const timer = window.setTimeout(() => setDebounced(value), 300);
		return () => window.clearTimeout(timer);
	}, [value]);

	useEffect(() => {
		function onPointerDown(event: PointerEvent) {
			if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
		}
		document.addEventListener("pointerdown", onPointerDown);
		return () => document.removeEventListener("pointerdown", onPointerDown);
	}, []);

	const places = search.data ?? [];
	const showList =
		open &&
		value.trim().length >= 3 &&
		(search.isFetching || places.length > 0);

	async function locateHere() {
		setLocating(true);
		try {
			const coords = await currentCoords();
			if (coords.latitude == null || coords.longitude == null) {
				toast.error("Could not read your current position.");
				return;
			}
			const place = await reversePlace(coords.latitude, coords.longitude);
			if (!place) {
				toast.error("No address found for your current position.");
				return;
			}
			onSelect(place);
			setOpen(false);
		} catch (error) {
			toast.error((error as Error).message);
		} finally {
			setLocating(false);
		}
	}

	function select(place: PlaceDto) {
		onSelect(place);
		setOpen(false);
	}

	return (
		<div ref={rootRef} className="relative">
			<div className="flex gap-2">
				<Input
					id={id}
					role="combobox"
					aria-autocomplete="list"
					aria-expanded={showList}
					aria-controls={listId}
					autoComplete="off"
					value={value}
					placeholder="900 E 11th St, Austin, TX"
					onFocus={() => setOpen(true)}
					onChange={(event) => {
						onValueChange(event.target.value);
						setOpen(true);
						setActiveIndex(0);
					}}
					onKeyDown={(event) => {
						if (event.key === "Escape") {
							setOpen(false);
							return;
						}
						if (!showList || places.length === 0) return;
						if (event.key === "ArrowDown") {
							event.preventDefault();
							setActiveIndex((index) => (index + 1) % places.length);
						} else if (event.key === "ArrowUp") {
							event.preventDefault();
							setActiveIndex(
								(index) => (index - 1 + places.length) % places.length,
							);
						} else if (event.key === "Enter") {
							const place = places[activeIndex];
							if (place) {
								event.preventDefault();
								select(place);
							}
						}
					}}
				/>
				<Button
					type="button"
					variant="outline"
					size="icon"
					aria-label="Use current position"
					disabled={locating}
					onClick={() => void locateHere()}
				>
					{locating ? <Spinner /> : <LocateFixedIcon />}
				</Button>
			</div>
			{showList ? (
				<div
					id={listId}
					className="absolute z-20 mt-1 max-h-60 w-full overflow-auto rounded-md border bg-popover p-1 text-popover-foreground shadow-md"
				>
					{search.isFetching && places.length === 0 ? (
						<p className="px-2 py-1.5 text-muted-foreground text-xs">
							Searching places…
						</p>
					) : (
						places.map((place, index) => (
							<button
								key={place.osmId}
								type="button"
								className={`flex w-full flex-col items-start rounded-sm px-2 py-1.5 text-left text-xs ${
									index === activeIndex ? "bg-muted" : "hover:bg-muted/70"
								}`}
								onMouseEnter={() => setActiveIndex(index)}
								onClick={() => select(place)}
							>
								<span className="font-medium">{place.name}</span>
								{place.addressLine !== place.name ? (
									<span className="text-muted-foreground">
										{place.addressLine}
									</span>
								) : null}
							</button>
						))
					)}
				</div>
			) : null}
		</div>
	);
}
