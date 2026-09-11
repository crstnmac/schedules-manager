import { Button } from "@SchedulesManager/ui/components/button";
import { Checkbox } from "@SchedulesManager/ui/components/checkbox";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@SchedulesManager/ui/components/dialog";
import { Field, FieldLabel } from "@SchedulesManager/ui/components/field";
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
import { useMutation } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { api } from "@/lib/api";
import { useDisplayPrefs } from "@/lib/use-display-prefs";

export interface PatternSummary {
	id: string;
	name: string;
	cycleWeeks?: number;
}

interface PreviewShift {
	date: string;
	startMinute: number;
	endMinute: number;
	overnight: boolean;
	positionId: string;
	note: string | null;
	coverageTarget: number;
	assignedEmploymentIds: string[];
}

interface PreviewDay {
	date: string;
	shifts: PreviewShift[];
}

interface PreviewWeek {
	weekStart: string;
	days: PreviewDay[];
}

interface PreviewMember {
	employmentId: string;
	rotationSlot: number;
	name: string | null;
	email: string;
}

interface PreviewResponse {
	pattern: { id: string; name: string; cycleWeeks: number };
	members: PreviewMember[];
	weeks: PreviewWeek[];
}

function dayLabel(date: string): string {
	return new Date(`${date}T00:00:00Z`).toLocaleDateString("en-US", {
		weekday: "short",
		month: "short",
		day: "numeric",
		timeZone: "UTC",
	});
}

function weekLabel(date: string): string {
	return new Date(`${date}T00:00:00Z`).toLocaleDateString("en-US", {
		month: "short",
		day: "numeric",
		year: "numeric",
		timeZone: "UTC",
	});
}

export function PatternApplyDialog({
	open,
	onOpenChange,
	locationId,
	weekStart,
	patterns,
	teamId,
	onApplied,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	locationId: string | undefined;
	weekStart: string;
	patterns: PatternSummary[];
	teamId?: string | null;
	onApplied?: () => void;
}) {
	const { formatShiftRange } = useDisplayPrefs();
	const [patternId, setPatternId] = useState("");
	const [weeks, setWeeks] = useState(4);
	const [replace, setReplace] = useState(true);
	const [preview, setPreview] = useState<PreviewResponse | null>(null);
	const wasOpen = useRef(false);

	useEffect(() => {
		if (open && !wasOpen.current) {
			setPatternId(patterns[0]?.id ?? "");
			setWeeks(4);
			setReplace(true);
			setPreview(null);
		}
		wasOpen.current = open;
	}, [open, patterns]);

	const memberName = useMemo(() => {
		const map = new Map<string, string>();
		for (const member of preview?.members ?? []) {
			map.set(member.employmentId, member.name ?? member.email);
		}
		return map;
	}, [preview]);

	const runPreview = useMutation({
		mutationFn: () =>
			api<PreviewResponse>(
				`/v1/locations/${locationId}/schedules/${weekStart}/patterns/${patternId}/preview`,
				{ method: "POST", body: { weeks } },
			),
		onSuccess: (data) => setPreview(data),
		onError: (error) => toast.error((error as Error).message),
	});

	const apply = useMutation({
		mutationFn: () =>
			api<{ applied: number; weeks: number }>(
				`/v1/locations/${locationId}/schedules/${weekStart}/patterns/${patternId}/apply`,
				{ method: "POST", body: { weeks, replace, teamId: teamId ?? null } },
			),
		onSuccess: (data) => {
			toast.success(
				`Applied ${data.applied} shift${data.applied === 1 ? "" : "s"} across ${data.weeks} week${data.weeks === 1 ? "" : "s"}.`,
			);
			onApplied?.();
			onOpenChange(false);
		},
		onError: (error) => toast.error((error as Error).message),
	});

	const canRun = Boolean(locationId && patternId) && !runPreview.isPending;

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-2xl">
				<DialogHeader>
					<DialogTitle>Apply a shift pattern</DialogTitle>
					<DialogDescription>
						Project a rotation onto consecutive weeks from the week of{" "}
						{weekStart ? weekLabel(weekStart) : "—"}.
					</DialogDescription>
				</DialogHeader>

				{patterns.length === 0 ? (
					<p className="text-muted-foreground text-sm">
						No shift patterns are defined for this Workplace yet.
					</p>
				) : (
					<div className="flex flex-col gap-4">
						<div className="grid gap-3 sm:grid-cols-[2fr_1fr]">
							<Field>
								<FieldLabel htmlFor="apply-pattern">Pattern</FieldLabel>
								<Select
									items={patterns.map((pattern) => ({
										label: pattern.name,
										value: pattern.id,
									}))}
									value={patternId}
									onValueChange={(value) => {
										setPatternId(value ?? "");
										setPreview(null);
									}}
								>
									<SelectTrigger id="apply-pattern" className="w-full">
										<SelectValue placeholder="Choose a pattern" />
									</SelectTrigger>
									<SelectContent alignItemWithTrigger={false}>
										<SelectGroup>
											{patterns.map((pattern) => (
												<SelectItem key={pattern.id} value={pattern.id}>
													{pattern.name}
												</SelectItem>
											))}
										</SelectGroup>
									</SelectContent>
								</Select>
							</Field>
							<Field>
								<FieldLabel htmlFor="apply-weeks">Weeks</FieldLabel>
								<Input
									id="apply-weeks"
									type="number"
									min={1}
									max={12}
									value={weeks}
									onChange={(event) => {
										setWeeks(
											Math.min(
												12,
												Math.max(1, Number(event.target.value) || 1),
											),
										);
										setPreview(null);
									}}
								/>
							</Field>
						</div>

						<div className="flex flex-wrap items-center gap-4">
							<Button
								type="button"
								variant="outline"
								size="sm"
								disabled={!canRun}
								onClick={() => runPreview.mutate()}
							>
								{runPreview.isPending ? (
									<Spinner data-icon="inline-start" />
								) : null}
								Preview
							</Button>
							<Field orientation="horizontal" className="items-center">
								<Checkbox
									id="apply-replace"
									checked={replace}
									onCheckedChange={() => setReplace((current) => !current)}
								/>
								<FieldLabel htmlFor="apply-replace" className="font-normal">
									Replace existing draft shifts in those weeks
								</FieldLabel>
							</Field>
						</div>

						{preview ? (
							preview.weeks.every((week) => week.days.length === 0) ? (
								<div className="rounded-lg border border-dashed p-6 text-center text-muted-foreground text-sm">
									This pattern has no shifts in the selected range.
								</div>
							) : (
								<div className="flex max-h-[45vh] flex-col gap-4 overflow-y-auto pr-1">
									{preview.weeks.map((week) => (
										<div key={week.weekStart} className="flex flex-col gap-2">
											<p className="font-medium text-sm">
												Week of {weekLabel(week.weekStart)}
											</p>
											{week.days.map((day) => (
												<div key={day.date} className="flex flex-col gap-1">
													<p className="text-muted-foreground text-xs">
														{dayLabel(day.date)}
													</p>
													{day.shifts.map((shift) => {
														const names = shift.assignedEmploymentIds
															.map(
																(id) => memberName.get(id) ?? "Unknown worker",
															)
															.join(", ");
														return (
															<div
																key={`${day.date}-${shift.positionId}-${shift.startMinute}-${shift.endMinute}`}
																className="flex items-center justify-between gap-3 rounded-md border px-3 py-2 text-sm"
															>
																<span className="tabular-nums">
																	{formatShiftRange(
																		shift.startMinute,
																		shift.endMinute,
																		shift.overnight,
																	)}
																</span>
																<span className="min-w-0 truncate text-muted-foreground text-xs">
																	{names || "Unassigned"}
																</span>
																{shift.coverageTarget > 1 ? (
																	<span className="text-muted-foreground text-xs">
																		×{shift.coverageTarget}
																	</span>
																) : null}
															</div>
														);
													})}
												</div>
											))}
										</div>
									))}
								</div>
							)
						) : (
							<p className="text-muted-foreground text-xs">
								Run a preview to see the projected shifts before applying.
							</p>
						)}
					</div>
				)}

				<DialogFooter>
					<Button
						type="button"
						variant="outline"
						onClick={() => onOpenChange(false)}
					>
						Cancel
					</Button>
					<Button
						type="button"
						disabled={!preview || apply.isPending}
						onClick={() => apply.mutate()}
					>
						{apply.isPending ? <Spinner data-icon="inline-start" /> : null}
						Apply to draft
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
