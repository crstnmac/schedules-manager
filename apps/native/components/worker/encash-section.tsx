import { useState } from "react";
import { Alert, StyleSheet, View } from "react-native";

import {
	Button,
	Card,
	ChoiceChips,
	FadeSwap,
	NativeField,
	Section,
} from "@/components/ui";
import { hoursToMinutes } from "@/lib/leave";
import { type LeaveTypeDto, useCreateMyLeaveEncashment } from "@/lib/queries";
import { spacing } from "@/theme";

/**
 * Encashment request form. Owns its own draft state so typing here does not
 * rerender the whole time-off screen.
 */
export function EncashSection({
	workplaceId,
	leaveTypes,
}: {
	workplaceId: string | undefined;
	leaveTypes: LeaveTypeDto[];
}) {
	const createEncashment = useCreateMyLeaveEncashment(workplaceId);
	const [open, setOpen] = useState(false);
	const [leaveTypeId, setLeaveTypeId] = useState("");
	const [hours, setHours] = useState("8");
	const [note, setNote] = useState("");

	async function submit() {
		if (!leaveTypeId) {
			Alert.alert("Leave type", "Choose a leave type to encash.");
			return;
		}
		const minutes = hoursToMinutes(hours);
		if (minutes <= 0) {
			Alert.alert("Hours", "Enter how many hours to encash.");
			return;
		}
		try {
			await createEncashment.mutateAsync({
				leaveTypeId,
				minutes,
				note: note.trim() || undefined,
			});
			setOpen(false);
			setHours("8");
			setNote("");
			Alert.alert("Requested", "Your manager will review the encashment.");
		} catch (e) {
			Alert.alert("Could not request", (e as Error).message);
		}
	}

	if (leaveTypes.length === 0) return null;

	return (
		<Section
			title="Encash leave"
			caption="Turn unused leave into pay. A Manager must approve the request."
		>
			<Card>
				{open ? (
					<FadeSwap style={{ gap: spacing.lg }}>
						<ChoiceChips
							accessibilityLabel="Leave type to encash"
							options={leaveTypes.map((type) => ({
								value: type.id,
								label: type.name,
							}))}
							value={leaveTypeId}
							onChange={setLeaveTypeId}
						/>
						<NativeField
							label="Hours"
							value={hours}
							onChange={setHours}
							keyboardType="decimal-pad"
						/>
						<NativeField
							label="Note (optional)"
							value={note}
							onChange={setNote}
						/>
						<View style={styles.actionsRow}>
							<Button
								label="Cancel"
								variant="secondary"
								onPress={() => setOpen(false)}
								style={{ flex: 1 }}
							/>
							<Button
								label="Request"
								loading={createEncashment.isPending}
								onPress={() => void submit()}
								style={{ flex: 1 }}
							/>
						</View>
					</FadeSwap>
				) : (
					<Button
						variant="tinted"
						label="Encash leave"
						onPress={() => {
							setLeaveTypeId((current) => current || leaveTypes[0]?.id || "");
							setOpen(true);
						}}
					/>
				)}
			</Card>
		</Section>
	);
}

const styles = StyleSheet.create({
	actionsRow: { flexDirection: "row", gap: spacing.sm },
});
