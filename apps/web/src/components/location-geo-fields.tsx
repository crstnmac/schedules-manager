import {
	Field,
	FieldDescription,
	FieldLabel,
} from "@SchedulesManager/ui/components/field";
import { Input } from "@SchedulesManager/ui/components/input";
import { Skeleton } from "@SchedulesManager/ui/components/skeleton";
import { lazy, Suspense, useEffect, useRef, useState } from "react";

import { AddressSearch } from "@/components/address-search";
import { type PlaceDto, reversePlace } from "@/lib/queries";

const LocationMap = lazy(async () => {
	await import("leaflet/dist/leaflet.css");
	const module = await import("@/components/location-map");
	return { default: module.LocationMap };
});

export type LocationGeoValue = {
	addressLine: string;
	latitude: string;
	longitude: string;
	geofenceRadiusMeters: string;
};

export function LocationGeoFields({
	idPrefix,
	value,
	onChange,
	onTimezone,
}: {
	idPrefix: string;
	value: LocationGeoValue;
	onChange: (value: LocationGeoValue) => void;
	onTimezone?: (timezone: string) => void;
}) {
	const valueRef = useRef(value);
	valueRef.current = value;
	const [mapReady, setMapReady] = useState(false);

	useEffect(() => {
		setMapReady(true);
	}, []);

	function patch(next: Partial<LocationGeoValue>) {
		onChange({ ...valueRef.current, ...next });
	}

	function applyPlace(place: PlaceDto) {
		patch({
			addressLine: place.addressLine,
			latitude: place.latitude,
			longitude: place.longitude,
		});
		if (place.timezone) onTimezone?.(place.timezone);
	}

	const latitude = Number(value.latitude);
	const longitude = Number(value.longitude);
	const hasPoint =
		Number.isFinite(latitude) &&
		Number.isFinite(longitude) &&
		value.latitude.trim() !== "" &&
		value.longitude.trim() !== "";
	const radius = value.geofenceRadiusMeters
		? Number(value.geofenceRadiusMeters)
		: null;

	async function movePin(nextLatitude: number, nextLongitude: number) {
		patch({
			latitude: String(nextLatitude),
			longitude: String(nextLongitude),
		});
		try {
			const place = await reversePlace(nextLatitude, nextLongitude);
			if (!place) return;
			patch({
				addressLine: place.addressLine,
				latitude: String(nextLatitude),
				longitude: String(nextLongitude),
			});
			if (place.timezone) onTimezone?.(place.timezone);
		} catch {
			// Keep the pin even if reverse geocoding is unavailable.
		}
	}

	return (
		<>
			<Field className="sm:col-span-2">
				<FieldLabel htmlFor={`${idPrefix}-address`}>Address</FieldLabel>
				<AddressSearch
					id={`${idPrefix}-address`}
					value={value.addressLine}
					onValueChange={(addressLine) => patch({ addressLine })}
					onSelect={applyPlace}
				/>
				<FieldDescription>
					Search for the workplace, or use your current position if you are on
					site.
				</FieldDescription>
			</Field>
			<Field>
				<FieldLabel htmlFor={`${idPrefix}-geofence`}>
					Geofence radius (meters)
				</FieldLabel>
				<Input
					id={`${idPrefix}-geofence`}
					type="number"
					min={20}
					max={5000}
					value={value.geofenceRadiusMeters}
					onChange={(event) =>
						patch({ geofenceRadiusMeters: event.target.value })
					}
					placeholder="150"
				/>
				<FieldDescription>
					Leave empty to allow clock-in from anywhere. Set a radius to require
					workers to be inside this Location.
				</FieldDescription>
			</Field>
			{hasPoint ? (
				<Field className="sm:col-span-2">
					<FieldLabel>Map</FieldLabel>
					<div className="h-56 overflow-hidden rounded-lg border [&_.leaflet-container]:z-0 [&_.leaflet-container]:h-full [&_.leaflet-container]:w-full [&_.leaflet-container]:font-[inherit] [&_.leaflet-control-attribution]:text-[10px]">
						{mapReady ? (
							<Suspense fallback={<Skeleton className="h-full" />}>
								<LocationMap
									latitude={latitude}
									longitude={longitude}
									radiusMeters={
										radius && Number.isFinite(radius) ? radius : null
									}
									onMove={(nextLatitude, nextLongitude) => {
										void movePin(nextLatitude, nextLongitude);
									}}
								/>
							</Suspense>
						) : (
							<Skeleton className="h-full" />
						)}
					</div>
					<FieldDescription>
						Click the map to move the pin. Map data © OpenStreetMap.
					</FieldDescription>
				</Field>
			) : null}
		</>
	);
}
