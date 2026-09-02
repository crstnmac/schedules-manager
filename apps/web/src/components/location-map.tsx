import { useEffect } from "react";
import {
	Circle,
	CircleMarker,
	MapContainer,
	TileLayer,
	useMap,
	useMapEvents,
} from "react-leaflet";

function Recenter({
	latitude,
	longitude,
}: {
	latitude: number;
	longitude: number;
}) {
	const map = useMap();
	useEffect(() => {
		map.setView([latitude, longitude]);
	}, [latitude, longitude, map]);
	return null;
}

function ClickToMove({
	onMove,
}: {
	onMove: (latitude: number, longitude: number) => void;
}) {
	useMapEvents({
		click(event) {
			onMove(event.latlng.lat, event.latlng.lng);
		},
	});
	return null;
}

export function LocationMap({
	latitude,
	longitude,
	radiusMeters,
	onMove,
}: {
	latitude: number;
	longitude: number;
	radiusMeters: number | null;
	onMove: (latitude: number, longitude: number) => void;
}) {
	return (
		<MapContainer
			center={[latitude, longitude]}
			zoom={16}
			scrollWheelZoom={false}
			className="h-full w-full"
		>
			<TileLayer
				attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
				url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
			/>
			<Recenter latitude={latitude} longitude={longitude} />
			<ClickToMove onMove={onMove} />
			<CircleMarker
				center={[latitude, longitude]}
				pathOptions={{ color: "#2563eb", fillColor: "#2563eb", fillOpacity: 1 }}
				radius={7}
			/>
			{radiusMeters ? (
				<Circle
					center={[latitude, longitude]}
					pathOptions={{
						color: "#2563eb",
						fillColor: "#2563eb",
						fillOpacity: 0.12,
						weight: 1,
					}}
					radius={radiusMeters}
				/>
			) : null}
		</MapContainer>
	);
}
