import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@SchedulesManager/ui/components/alert-dialog";
import { Button } from "@SchedulesManager/ui/components/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@SchedulesManager/ui/components/dropdown-menu";
import { Field, FieldLabel } from "@SchedulesManager/ui/components/field";
import { Input } from "@SchedulesManager/ui/components/input";
import { Spinner } from "@SchedulesManager/ui/components/spinner";
import { usePostHog } from "@posthog/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { EllipsisIcon, LayoutTemplateIcon, UsersIcon } from "lucide-react";
import { lazy, memo, Suspense, useCallback, useState } from "react";
import { toast } from "sonner";
import { ImportSheet } from "@/components/import-sheet";
import { useInvalidateSchedule } from "@/components/schedule/use-schedule-invalidate";
import { api } from "@/lib/api";
import {
	useApplyScheduleTemplate,
	useSaveScheduleTemplate,
	useScheduleTemplates,
	useShiftPatterns,
} from "@/lib/queries";
import { useWorkplace } from "@/lib/use-workplace";

const PatternApplyDialog = lazy(() =>
	import("@/components/schedule/pattern-apply-dialog").then((m) => ({
		default: m.PatternApplyDialog,
	})),
);

// Module-level fallbacks keep the `patterns`/`templates` props referentially
// stable while those queries are still loading.
const EMPTY_PATTERNS: NonNullable<ReturnType<typeof useShiftPatterns>["data"]> =
	[];
const EMPTY_TEMPLATES: NonNullable<
	ReturnType<typeof useScheduleTemplates>["data"]
> = [];

interface ImportedShiftEntry {
	line: number;
	date: string;
	position: string;
	email: string | null;
	workerName: string | null;
	startsAt: string;
}

const renderImportEntry = (entry: ImportedShiftEntry) => (
	<span>
		{entry.date} · {entry.position} ·{" "}
		{entry.email ?? entry.workerName ?? "Open shift"}
	</span>
);

const importEntryKey = (entry: ImportedShiftEntry) =>
	`${entry.line}-${entry.startsAt}-${entry.position}`;

/**
 * The "more schedule actions" menu and every dialog it opens (copy last week,
 * save as template, CSV import, apply pattern). It owns the open state, the
 * template-name draft and the related mutations, so none of it rerenders the
 * schedule page. Dialogs stay mounted so close animations play.
 */
export const ScheduleActionsMenu = memo(function ScheduleActionsMenu({
	locationId,
	weekStart,
	teamId,
	canManage,
	shiftCount,
	openShiftCount,
}: {
	locationId: string | undefined;
	weekStart: string;
	teamId: string | null;
	canManage: boolean;
	/** Shifts in the loaded week, or undefined while it has not loaded. */
	shiftCount: number | undefined;
	openShiftCount: number;
}) {
	const { workplace, capabilities } = useWorkplace();
	const navigate = useNavigate();
	const posthog = usePostHog();
	const queryClient = useQueryClient();
	const invalidate = useInvalidateSchedule(locationId, weekStart, teamId);
	const templates = useScheduleTemplates(locationId);
	const patterns = useShiftPatterns(workplace?.id);
	const saveTemplate = useSaveScheduleTemplate(locationId);
	const applyTemplate = useApplyScheduleTemplate(locationId);
	const [patternOpen, setPatternOpen] = useState(false);
	const [scheduleImportOpen, setScheduleImportOpen] = useState(false);
	const [copyPreviousConfirmOpen, setCopyPreviousConfirmOpen] = useState(false);
	const [saveTemplateOpen, setSaveTemplateOpen] = useState(false);
	const [templateName, setTemplateName] = useState("");

	const copyPrevious = useMutation({
		mutationFn: () =>
			api(`/v1/locations/${locationId}/schedules/${weekStart}/copy-previous`, {
				method: "POST",
				body: { teamId },
			}),
		onSuccess: async () => {
			await invalidate();
			toast.success("Previous week copied.");
		},
		onError: (error) => toast.error((error as Error).message),
	});

	const autoAssign = useMutation({
		mutationFn: () =>
			api<{ assigned: number }>(
				`/v1/locations/${locationId}/schedules/${weekStart}/auto-assign`,
				{ method: "POST", body: { teamId } },
			),
		onSuccess: async (result) => {
			await invalidate();
			toast.success(
				result.assigned === 0
					? "No unassigned Shifts could be filled."
					: `Assigned ${result.assigned} Shift${result.assigned === 1 ? "" : "s"}.`,
			);
		},
		onError: (error) => toast.error((error as Error).message),
	});

	const handlePatternApplied = useCallback(() => {
		void queryClient.invalidateQueries({
			queryKey: ["schedule", locationId, weekStart, teamId],
		});
		toast.success("Shift pattern applied.");
	}, [queryClient, locationId, weekStart, teamId]);

	const handleImported = useCallback(() => {
		void invalidate();
		posthog?.capture("schedule_import_completed", { week_start: weekStart });
	}, [invalidate, posthog, weekStart]);

	const patternItems = patterns.data ?? EMPTY_PATTERNS;
	const templateRows = templates.data ?? EMPTY_TEMPLATES;
	const hasShifts = (shiftCount ?? 0) > 0;

	return (
		<>
			<DropdownMenu>
				<DropdownMenuTrigger
					render={
						<Button variant="ghost" size="icon-sm" disabled={!locationId} />
					}
				>
					<EllipsisIcon />
					<span className="sr-only">More schedule actions</span>
				</DropdownMenuTrigger>
				<DropdownMenuContent align="end" className="min-w-56">
					<DropdownMenuGroup>
						<DropdownMenuItem
							disabled={!canManage || !locationId}
							onClick={() => setScheduleImportOpen(true)}
						>
							Import shifts from CSV
						</DropdownMenuItem>
						<DropdownMenuItem
							disabled={!canManage || copyPrevious.isPending || !locationId}
							onClick={() => {
								if (hasShifts) {
									setCopyPreviousConfirmOpen(true);
								} else {
									copyPrevious.mutate();
								}
							}}
						>
							{copyPrevious.isPending ? <Spinner /> : null}
							Copy last week
						</DropdownMenuItem>
						<DropdownMenuItem
							disabled={!canManage || saveTemplate.isPending || !hasShifts}
							onClick={() => {
								setTemplateName("");
								setSaveTemplateOpen(true);
							}}
						>
							Save as template
						</DropdownMenuItem>
						<DropdownMenuItem
							disabled={!canManage || !locationId || patternItems.length === 0}
							onClick={() => setPatternOpen(true)}
						>
							<LayoutTemplateIcon />
							Apply pattern
						</DropdownMenuItem>
						{capabilities.operations ? (
							<DropdownMenuItem
								disabled={
									!canManage ||
									autoAssign.isPending ||
									shiftCount === undefined ||
									openShiftCount === 0
								}
								onClick={() => autoAssign.mutate()}
							>
								Auto-assign open shifts
							</DropdownMenuItem>
						) : (
							<DropdownMenuItem
								onClick={() =>
									navigate({ to: "/dashboard/settings/subscription" })
								}
							>
								Auto-assign open shifts (Operations plan)
							</DropdownMenuItem>
						)}
					</DropdownMenuGroup>
					<DropdownMenuSeparator />
					<DropdownMenuGroup>
						<DropdownMenuItem
							render={<Link to="/dashboard/settings/schedule-teams" />}
						>
							<UsersIcon />
							Manage teams
						</DropdownMenuItem>
					</DropdownMenuGroup>
					{templateRows.length > 0 ? (
						<>
							<DropdownMenuSeparator />
							<DropdownMenuGroup>
								{templateRows.map((template) => (
									<DropdownMenuItem
										key={template.id}
										disabled={!canManage || applyTemplate.isPending}
										onClick={() =>
											applyTemplate.mutate(
												{
													weekStart,
													templateId: template.id,
													teamId,
												},
												{
													onSuccess: () =>
														toast.success(
															`Applied “${template.name}”. Review the draft before publishing.`,
														),
													onError: (error) =>
														toast.error((error as Error).message),
												},
											)
										}
									>
										Apply {template.name}
									</DropdownMenuItem>
								))}
							</DropdownMenuGroup>
						</>
					) : null}
				</DropdownMenuContent>
			</DropdownMenu>

			<AlertDialog
				open={copyPreviousConfirmOpen}
				onOpenChange={setCopyPreviousConfirmOpen}
			>
				<AlertDialogContent size="sm">
					<AlertDialogHeader>
						<AlertDialogTitle>Copy last week into this draft?</AlertDialogTitle>
						<AlertDialogDescription>
							This draft already has {shiftCount ?? 0}{" "}
							{shiftCount === 1 ? "shift" : "shifts"}. Copying adds last week’s
							shifts on top of them — it does not replace them.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>Cancel</AlertDialogCancel>
						<AlertDialogAction
							disabled={copyPrevious.isPending}
							onClick={(event) => {
								event.preventDefault();
								setCopyPreviousConfirmOpen(false);
								copyPrevious.mutate();
							}}
						>
							{copyPrevious.isPending ? (
								<Spinner data-icon="inline-start" />
							) : null}
							Copy and add
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
			<AlertDialog open={saveTemplateOpen} onOpenChange={setSaveTemplateOpen}>
				<AlertDialogContent size="sm">
					<AlertDialogHeader>
						<AlertDialogTitle>Save this week as a template</AlertDialogTitle>
						<AlertDialogDescription>
							Stores this draft’s Shift times, Positions, and assignments so you
							can apply them to another week. Applying replaces that week’s
							draft.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<Field>
						<FieldLabel htmlFor="template-name">Template name</FieldLabel>
						<Input
							id="template-name"
							value={templateName}
							onChange={(event) => setTemplateName(event.target.value)}
							placeholder="Weekday opening"
						/>
					</Field>
					<AlertDialogFooter>
						<AlertDialogCancel>Cancel</AlertDialogCancel>
						<AlertDialogAction
							disabled={
								saveTemplate.isPending || templateName.trim().length === 0
							}
							onClick={(event) => {
								event.preventDefault();
								saveTemplate.mutate(
									{
										weekStart,
										name: templateName.trim(),
										teamId,
									},
									{
										onSuccess: () => {
											setSaveTemplateOpen(false);
											toast.success("Template saved.");
										},
										onError: (error) => toast.error((error as Error).message),
									},
								);
							}}
						>
							{saveTemplate.isPending ? (
								<Spinner data-icon="inline-start" />
							) : null}
							Save template
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
			<ImportSheet<ImportedShiftEntry>
				key={`${locationId}-${weekStart}-${teamId}`}
				open={scheduleImportOpen}
				requireAllValid
				onOpenChange={setScheduleImportOpen}
				title="Import shifts into this draft"
				description="Upload one workweek at a time. Preview validates every shift; a file with errors imports nothing. Workers and positions must already exist. Sling names must uniquely match active workers. No shifts are published automatically."
				modes={
					locationId
						? [
								{
									value: "schedule",
									label: "Schedule CSV",
									importPath: `/v1/locations/${locationId}/schedules/${weekStart}/import${teamId ? `?teamId=${teamId}` : ""}`,
									templatePath: `/v1/locations/${locationId}/schedules/import/template.csv`,
									templateFileName: "schedule-import-template.csv",
									successNoun: "shift(s)",
									help: "Upload a Sling schedule CSV directly, or use the template with date, start time, end time, position, and worker email. Sling names must match uniquely; open shifts have no worker. All shifts go to the selected jooling location.",
								},
							]
						: []
				}
				renderEntry={renderImportEntry}
				entryKey={importEntryKey}
				onImported={handleImported}
			/>
			<Suspense fallback={null}>
				<PatternApplyDialog
					open={patternOpen}
					onOpenChange={setPatternOpen}
					locationId={locationId}
					weekStart={weekStart}
					patterns={patternItems}
					teamId={teamId}
					onApplied={handlePatternApplied}
				/>
			</Suspense>
		</>
	);
});
