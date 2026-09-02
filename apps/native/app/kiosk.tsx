import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useState } from "react";
import {
	ActivityIndicator,
	Alert,
	Pressable,
	StyleSheet,
	Text,
	View,
} from "react-native";

import {
	AppScreen,
	Card,
	NativeField,
	PageHeader,
	PrimaryButton,
	useAppTheme,
} from "@/components/ui";
import { ApiError } from "@/lib/api";
import {
	requestForegroundCoordinates,
	useCurrentEmployment,
	useWorkplaceLocations,
} from "@/lib/queries";
import { getServerUrl } from "@/lib/server-url";

export default function KioskScreen() {
	const { theme } = useAppTheme();
	const router = useRouter();
	const { isManager, workplaceId } = useCurrentEmployment();
	const locations = useWorkplaceLocations(workplaceId, isManager);
	const [locationId, setLocationId] = useState("");
	const [locationPin, setLocationPin] = useState("");
	const [workerPin, setWorkerPin] = useState("");
	const [action, setAction] = useState<"in" | "out">("in");
	const [submitting, setSubmitting] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const selectedLocationId = locationId || locations.data?.[0]?.id || "";

	async function clock() {
		if (!selectedLocationId || !locationPin || !workerPin) return;
		setSubmitting(true);
		setError(null);
		try {
			const coordinates = await requestForegroundCoordinates();
			const response = await fetch(`${getServerUrl()}/v1/kiosk/clock`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					locationId: selectedLocationId,
					locationPin,
					workerPin,
					action,
					...coordinates,
				}),
			});
			if (!response.ok) {
				const payload = (await response.json().catch(() => null)) as {
					message?: string;
				} | null;
				throw new ApiError(
					response.status,
					payload?.message ?? `Request failed (${response.status}).`,
				);
			}
			setWorkerPin("");
			Alert.alert(
				action === "in" ? "Clocked in" : "Clocked out",
				"The Time Entry was updated.",
			);
		} catch (cause) {
			setError(
				cause instanceof Error
					? cause.message
					: "Could not reach the Kiosk service.",
			);
		} finally {
			setSubmitting(false);
		}
	}

	return (
		<AppScreen>
			<Pressable
				accessibilityRole="button"
				accessibilityLabel="Go back"
				onPress={() => router.back()}
				style={styles.backRow}
			>
				<Ionicons name="chevron-back" size={20} color={theme.primary} />
				<Text style={[styles.backText, { color: theme.primary }]}>More</Text>
			</Pressable>
			<PageHeader
				eyebrow="MANAGER"
				title="Kiosk"
				description="Clock a Worker in or out using Location and Worker PINs."
			/>

			{locations.isLoading ? <ActivityIndicator color={theme.primary} /> : null}
			<Card>
				{locations.data && locations.data.length > 0 ? (
					<>
						<Text style={[styles.label, { color: theme.text }]}>Location</Text>
						<View style={styles.chips}>
							{locations.data.map((location) => {
								const selected = location.id === selectedLocationId;
								return (
									<Pressable
										key={location.id}
										accessibilityRole="radio"
										accessibilityState={{ checked: selected }}
										onPress={() => setLocationId(location.id)}
										style={[
											styles.chip,
											{
												borderColor: selected ? theme.primary : theme.border,
												backgroundColor: selected
													? theme.primary
													: "transparent",
											},
										]}
									>
										<Text
											style={{
												color: selected ? theme.onPrimary : theme.text,
												fontWeight: "700",
											}}
										>
											{location.name}
										</Text>
									</Pressable>
								);
							})}
						</View>
					</>
				) : !locations.isLoading ? (
					<NativeField
						label="Location UUID"
						value={locationId}
						onChange={setLocationId}
						placeholder="Enter the Location UUID"
					/>
				) : null}
				<NativeField
					label="Location PIN"
					value={locationPin}
					onChange={setLocationPin}
					placeholder="Enter Location PIN"
					secureTextEntry
					keyboardType="number-pad"
				/>
				<NativeField
					label="Worker PIN"
					value={workerPin}
					onChange={setWorkerPin}
					placeholder="Enter Worker PIN"
					secureTextEntry
					keyboardType="number-pad"
				/>
			</Card>

			<Card>
				<Text style={[styles.label, { color: theme.text }]}>Action</Text>
				<View style={styles.actionRow}>
					{(["in", "out"] as const).map((value) => {
						const selected = action === value;
						return (
							<Pressable
								key={value}
								accessibilityRole="radio"
								accessibilityState={{ checked: selected }}
								onPress={() => setAction(value)}
								style={[
									styles.action,
									{
										borderColor: selected ? theme.primary : theme.border,
										backgroundColor: selected ? theme.primary : "transparent",
									},
								]}
							>
								<Text
									style={{
										color: selected ? theme.onPrimary : theme.text,
										fontWeight: "700",
									}}
								>
									{value === "in" ? "Clock in" : "Clock out"}
								</Text>
							</Pressable>
						);
					})}
				</View>
				<PrimaryButton
					label={action === "in" ? "Clock in Worker" : "Clock out Worker"}
					loading={submitting}
					disabled={!selectedLocationId || !locationPin || !workerPin}
					onPress={() => void clock()}
				/>
				{error ? (
					<Text style={[styles.error, { color: theme.notification }]}>
						{error}
					</Text>
				) : null}
			</Card>
		</AppScreen>
	);
}

const styles = StyleSheet.create({
	backRow: {
		minHeight: 44,
		flexDirection: "row",
		alignItems: "center",
		gap: 4,
	},
	backText: { fontSize: 15, fontWeight: "600" },
	label: { fontSize: 13, fontWeight: "600" },
	chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
	chip: {
		minHeight: 42,
		borderWidth: 1,
		borderRadius: 999,
		paddingHorizontal: 14,
		alignItems: "center",
		justifyContent: "center",
	},
	actionRow: { flexDirection: "row", gap: 10 },
	action: {
		flex: 1,
		minHeight: 46,
		borderWidth: 1,
		borderRadius: 10,
		alignItems: "center",
		justifyContent: "center",
	},
	error: { fontSize: 14, lineHeight: 20 },
});
