export async function currentCoords(): Promise<{
	latitude?: number;
	longitude?: number;
}> {
	if (!navigator.geolocation) return {};
	return new Promise((resolve) => {
		navigator.geolocation.getCurrentPosition(
			(position) =>
				resolve({
					latitude: position.coords.latitude,
					longitude: position.coords.longitude,
				}),
			() => resolve({}),
			{ enableHighAccuracy: true, timeout: 4000, maximumAge: 15_000 },
		);
	});
}
