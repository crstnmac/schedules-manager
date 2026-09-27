import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { View } from "react-native";

import {
	AppText,
	Avatar,
	Button,
	Card,
	ChoiceChips,
	Divider,
	FadeSwap,
	Icon,
	ListGroup,
	ListRow,
	NativeDatePickerField,
	NativeField,
	PressableScale,
	Screen,
	Section,
	SegmentedControl,
} from "@/components/ui";
import { useDisplayPrefs } from "@/lib/display";
import { tapSuccess } from "@/lib/haptics";
import { todayIsoDate } from "@/lib/leave";
import { positionColor } from "@/lib/position-color";
import {
	useCurrentEmployment,
	useLeaveTypes,
	useManagerTimeOff,
	useManagerWorkers,
} from "@/lib/queries";
import { spacing, useAppTheme } from "@/theme";
import { useTimeOffActions } from "./use-time-off-actions";

type Who = "team" | "me";

/**
 * Add or edit time off without leaving the queue. "Team member" records
 * approved leave immediately; "Myself" files a request another Manager
 * approves. CSV import lives here too, out of the decision flow.
 */
export function TimeOffSheet() {
	const router = useRouter();
	const { editId, employmentId: presetEmploymentId } = useLocalSearchParams<{
		editId?: string;
		employmentId?: string;
	}>();
	const { workplaceId, employment } = useCurrentEmployment();
	const { formatPerson } = useDisplayPrefs();
	const leaveTypes = useLeaveTypes(workplaceId);
	const workers = useManagerWorkers(workplaceId);
	const timeOff = useManagerTimeOff(workplaceId);
	const actions = useTimeOffActions(workplaceId);

	const editing = editId
		? timeOff.data?.requests.find((request) => request.id === editId)
		: undefined;

	const [who, setWho] = useState<Who>("team");
	const [employmentId, setEmploymentId] = useState(presetEmploymentId ?? "");
	const [search, setSearch] = useState("");
	const [leaveTypeId, setLeaveTypeId] = useState("");
	const [startDate, setStartDate] = useState(todayIsoDate);
	const [endDate, setEndDate] = useState(todayIsoDate);
	const [reason, setReason] = useState("");

	useEffect(() => {
		if (!editing) return;
		setLeaveTypeId(editing.leaveTypeId ?? "");
		setStartDate(editing.startDate ?? editing.startsAt.slice(0, 10));
		setEndDate(editing.endDate ?? editing.endsAt.slice(0, 10));
		setReason(editing.reason ?? "");
	}, [editing]);

	const people = useMemo(
		() =>
			(workers.data?.workers ?? [])
				.filter((member) => member.status === "active")
				.map((member) => ({
					id: member.employmentId,
					name: formatPerson(member.profile.fullName, member.profile.email),
					email: member.profile.email,
					manager: member.kind === "manager",
				}))
				.sort((a, b) => a.name.localeCompare(b.name)),
		[workers.data, formatPerson],
	);
	const selectedPerson = people.find((person) => person.id === employmentId);
	const query = search.trim().toLowerCase();
	const matches = people
		.filter(
			(person) =>
				!query ||
				person.name.toLowerCase().includes(query) ||
				person.email.toLowerCase().includes(query),
		)
		.slice(0, 6);

	const draft = { leaveTypeId, startDate, endDate, reason };
	const pending =
		actions.record.isPending ||
		actions.requestMine.isPending ||
		actions.saveEdit.isPending;
	const ready =
		Boolean(leaveTypeId) &&
		(editing
			? true
			: who === "me"
				? Boolean(employment?.id)
				: Boolean(employmentId));

	function done() {
		tapSuccess();
		router.back();
	}

	function submit() {
		if (editing) {
			actions.saveEdit.mutate(
				{ ...draft, id: editing.id },
				{ onSuccess: done },
			);
		} else if (who === "me") {
			actions.requestMine.mutate(draft, { onSuccess: done });
		} else {
			actions.record.mutate({ ...draft, employmentId }, { onSuccess: done });
		}
	}

	return (
		<>
			<Stack.Screen
				options={{
					title: editing ? "Edit time off" : "Add time off",
					headerLeft: () => (
						<Button
							label="Cancel"
							variant="ghost"
							size="sm"
							onPress={() => router.back()}
						/>
					),
				}}
			/>
			<Screen>
				{editing ? (
					<Card
						style={{
							flexDirection: "row",
							alignItems: "center",
							gap: spacing.md,
						}}
					>
						<Avatar
							name={formatPerson(editing.worker.fullName, editing.worker.email)}
							color={positionColor(
								formatPerson(editing.worker.fullName, editing.worker.email),
							)}
						/>
						<View style={{ flex: 1 }}>
							<AppText variant="headline">
								{formatPerson(editing.worker.fullName, editing.worker.email)}
							</AppText>
							<AppText variant="footnote" tone="secondary">
								{editing.status === "approved"
									? "Approved time off"
									: "Pending request"}
							</AppText>
						</View>
					</Card>
				) : (
					<View style={{ gap: spacing.sm }}>
						<SegmentedControl<Who>
							value={who}
							onChange={setWho}
							options={[
								{ value: "team", label: "Team member" },
								{ value: "me", label: "Myself" },
							]}
						/>
						<AppText
							variant="footnote"
							tone="secondary"
							style={{ paddingHorizontal: spacing.xs }}
						>
							{who === "team"
								? "Approved immediately. Paid hours come out of their balance."
								: "Stays pending until another Manager approves it."}
						</AppText>
					</View>
				)}

				{!editing && who === "team" ? (
					<FadeSwap key="person">
						<Section title="Who">
							{selectedPerson ? (
								<Card
									style={{
										flexDirection: "row",
										alignItems: "center",
										gap: spacing.md,
									}}
								>
									<Avatar
										name={selectedPerson.name}
										color={positionColor(selectedPerson.name)}
									/>
									<View style={{ flex: 1 }}>
										<AppText variant="headline">{selectedPerson.name}</AppText>
										<AppText variant="footnote" tone="secondary">
											{selectedPerson.manager ? "Manager" : "Team member"}
										</AppText>
									</View>
									<Button
										label="Change"
										variant="ghost"
										size="sm"
										onPress={() => setEmploymentId("")}
									/>
								</Card>
							) : (
								<Card style={{ gap: spacing.sm }}>
									<NativeField
										label="Search people"
										value={search}
										onChange={setSearch}
										placeholder="Name or email"
									/>
									<PersonList
										people={matches}
										onSelect={(id) => {
											setEmploymentId(id);
											setSearch("");
										}}
									/>
									{people.length > matches.length && !query ? (
										<AppText variant="caption" tone="tertiary">
											Showing 6 of {people.length}. Search to find others.
										</AppText>
									) : null}
								</Card>
							)}
						</Section>
					</FadeSwap>
				) : null}

				<Section title="Details">
					<Card style={{ gap: spacing.lg }}>
						<View style={{ gap: spacing.sm }}>
							<AppText variant="footnote" weight="600" tone="secondary">
								Type
							</AppText>
							<ChoiceChips
								accessibilityLabel="Leave type"
								value={leaveTypeId}
								onChange={setLeaveTypeId}
								options={(leaveTypes.data?.leaveTypes ?? []).map((type) => ({
									value: type.id,
									label: type.name,
								}))}
							/>
						</View>
						<NativeDatePickerField
							label="From"
							value={startDate}
							onChange={(value) => {
								setStartDate(value);
								if (!endDate || endDate < value) setEndDate(value);
							}}
						/>
						<NativeDatePickerField
							label="Until"
							value={endDate}
							onChange={setEndDate}
						/>
						<NativeField
							label="Note (optional)"
							value={reason}
							onChange={setReason}
							placeholder="Visible to the team member"
						/>
					</Card>
				</Section>

				<Button
					label={
						editing
							? "Save changes"
							: who === "me"
								? "Send request"
								: "Record time off"
					}
					icon={
						editing ? "check" : who === "me" ? "arrowRight" : "calendarClock"
					}
					size="lg"
					loading={pending}
					disabled={!ready}
					onPress={submit}
				/>

				{!editing ? (
					<ListGroup>
						<ListRow
							icon="doc"
							iconTone="neutral"
							title={actions.importing ? "Importing…" : "Import from CSV"}
							subtitle="Bring in many records at once. You’ll see a preview first."
							onPress={() => void actions.importCsv()}
						/>
					</ListGroup>
				) : null}
			</Screen>
		</>
	);
}

function PersonList({
	people,
	onSelect,
}: {
	people: { id: string; name: string; manager: boolean }[];
	onSelect: (id: string) => void;
}) {
	const { theme } = useAppTheme();
	if (people.length === 0)
		return (
			<AppText
				variant="footnote"
				tone="secondary"
				style={{ paddingVertical: spacing.sm }}
			>
				No one matches that search.
			</AppText>
		);
	return (
		<View>
			{people.map((person, index) => (
				<View key={person.id}>
					{index > 0 ? <Divider inset={52} /> : null}
					<PressableScale
						accessibilityRole="button"
						accessibilityLabel={`Choose ${person.name}`}
						haptic
						pressedScale={0.985}
						onPress={() => onSelect(person.id)}
						style={{
							flexDirection: "row",
							alignItems: "center",
							gap: spacing.md,
							paddingVertical: spacing.sm + 2,
						}}
					>
						<Avatar
							name={person.name}
							size={40}
							color={positionColor(person.name)}
						/>
						<AppText
							variant="callout"
							weight="500"
							style={{ flex: 1 }}
							numberOfLines={1}
						>
							{person.name}
						</AppText>
						{person.manager ? (
							<AppText variant="caption" tone="tertiary">
								Manager
							</AppText>
						) : null}
						<Icon name="plus" size={16} color={theme.tint} />
					</PressableScale>
				</View>
			))}
		</View>
	);
}
