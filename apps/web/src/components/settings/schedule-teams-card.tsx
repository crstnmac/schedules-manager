import { Button } from "@SchedulesManager/ui/components/button";
import { ColorPicker } from "@SchedulesManager/ui/components/color-picker";
import {
	Field,
	FieldGroup,
	FieldLabel,
} from "@SchedulesManager/ui/components/field";
import { Input } from "@SchedulesManager/ui/components/input";
import {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@SchedulesManager/ui/components/select";
import { Spinner } from "@SchedulesManager/ui/components/spinner";
import { UsersIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { createDataColumnHelper } from "@/components/data-table";
import {
	SettingsCrudCard,
	SettingsFormSheet,
} from "@/components/settings/crud";
import type { LocationDto, ScheduleTeamDto } from "@/lib/queries";
import {
	useCreateScheduleTeam,
	useDeleteScheduleTeam,
	useScheduleTeams,
	useUpdateScheduleTeam,
} from "@/lib/queries";

const teamHelper = createDataColumnHelper<ScheduleTeamDto>();

export function ScheduleTeamsCard({ locations }: { locations: LocationDto[] }) {
	const [locationId, setLocationId] = useState<string | undefined>(undefined);
	const activeLocationId =
		locationId && locations.some((location) => location.id === locationId)
			? locationId
			: locations[0]?.id;

	const teams = useScheduleTeams(activeLocationId);
	const create = useCreateScheduleTeam(activeLocationId);
	const update = useUpdateScheduleTeam(activeLocationId);
	const remove = useDeleteScheduleTeam(activeLocationId);

	const [open, setOpen] = useState(false);
	const [editingId, setEditingId] = useState<string | null>(null);
	const [name, setName] = useState("");
	const [color, setColor] = useState("");

	function resetForm() {
		setEditingId(null);
		setName("");
		setColor("");
	}

	function startAdd() {
		resetForm();
		setOpen(true);
	}

	function startEdit(team: ScheduleTeamDto) {
		setEditingId(team.id);
		setName(team.name);
		setColor(team.color ?? "");
		setOpen(true);
	}

	const save = useMemo(
		() => (editingId ? update : create),
		[create, editingId, update],
	);

	function submit() {
		const trimmed = name.trim();
		if (!trimmed) return;
		const payload = { name: trimmed, color: color.trim() || null };
		const options = {
			onSuccess: () => {
				resetForm();
				setOpen(false);
				toast.success("Schedule team saved.");
			},
			onError: (error: Error) => toast.error(error.message),
		};
		if (editingId) {
			update.mutate({ teamId: editingId, ...payload }, options);
		} else {
			create.mutate(payload, options);
		}
	}

	const columns = useMemo(
		() =>
			teamHelper.columns([
				teamHelper.accessor("name", {
					header: "Team",
					cell: ({ getValue }) => (
						<span className="font-medium">{getValue()}</span>
					),
				}),
				teamHelper.accessor((row) => row.color, {
					id: "color",
					header: "Color",
					cell: ({ getValue }) => {
						const value = getValue();
						if (!value) {
							return <span className="text-muted-foreground">—</span>;
						}
						return (
							<span className="flex items-center gap-2">
								<span
									className="size-3 rounded-full border"
									style={{ backgroundColor: value }}
								/>
								<span className="text-muted-foreground text-xs">{value}</span>
							</span>
						);
					},
				}),
			]),
		[],
	);

	if (locations.length === 0) {
		return (
			<p className="text-muted-foreground text-sm">
				Add a location before creating schedule teams.
			</p>
		);
	}

	return (
		<div className="flex flex-col gap-4">
			<Field className="max-w-sm">
				<FieldLabel htmlFor="schedule-teams-location">Location</FieldLabel>
				<Select
					items={locations.map((location) => ({
						label: location.name,
						value: location.id,
					}))}
					value={activeLocationId}
					onValueChange={(value) => {
						if (value) {
							setLocationId(value);
							resetForm();
							setOpen(false);
						}
					}}
				>
					<SelectTrigger id="schedule-teams-location" className="w-full">
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						<SelectGroup>
							{locations.map((location) => (
								<SelectItem key={location.id} value={location.id}>
									{location.name}
								</SelectItem>
							))}
						</SelectGroup>
					</SelectContent>
				</Select>
			</Field>

			<SettingsCrudCard
				title="Schedule teams"
				description="Run parallel schedules for one location, such as Front of House and Back of House."
				count={(teams.data ?? []).length}
				data={teams.data ?? []}
				isLoading={teams.isLoading}
				columns={columns}
				getRowId={(row) => row.id}
				getSearchText={(row) => row.name}
				searchPlaceholder="Search teams"
				entityLabel="team"
				emptyIcon={<UsersIcon />}
				emptyTitle="No schedule teams yet"
				emptyDescription="Add a team to run a second schedule alongside the primary one."
				addLabel="Add team"
				onAdd={startAdd}
				rowActions={{
					onEdit: startEdit,
					onDelete: (row) => remove.mutate(row.id),
					deleteTitle: "Delete this schedule team?",
					deleteDescription:
						"Its schedules and shifts for every week are removed. The location's primary schedule is unchanged.",
					deleteDisabled: remove.isPending,
				}}
			/>

			<SettingsFormSheet
				open={open}
				onOpenChange={(next) => {
					setOpen(next);
					if (!next) resetForm();
				}}
				title={editingId ? "Edit team" : "Add team"}
				description="Teams group shifts into a parallel schedule for one location."
				footer={
					<div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
						<Button
							variant="outline"
							onClick={() => {
								setOpen(false);
								resetForm();
							}}
						>
							Cancel
						</Button>
						<Button
							type="submit"
							form="schedule-team-form"
							disabled={save.isPending || !name.trim()}
						>
							{save.isPending ? <Spinner data-icon="inline-start" /> : null}
							{editingId ? "Save team" : "Add team"}
						</Button>
					</div>
				}
			>
				<form
					id="schedule-team-form"
					className="flex flex-col gap-4"
					onSubmit={(event) => {
						event.preventDefault();
						submit();
					}}
				>
					<FieldGroup>
						<Field>
							<FieldLabel htmlFor="schedule-team-name">Team name</FieldLabel>
							<Input
								id="schedule-team-name"
								value={name}
								onChange={(event) => setName(event.target.value)}
								placeholder="Front of House"
								autoFocus
								required
							/>
						</Field>
						<Field>
							<FieldLabel htmlFor="schedule-team-color">
								Color (optional)
							</FieldLabel>
							<ColorPicker
								id="schedule-team-color"
								value={color}
								onChange={setColor}
							/>
						</Field>
					</FieldGroup>
				</form>
			</SettingsFormSheet>
		</div>
	);
}
