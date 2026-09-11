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
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { TimePicker } from "@/components/time-picker";
import { api } from "@/lib/api";

const UNASSIGNED = "__unassigned__";

export interface BulkEditWorker {
	employmentId: string;
	name: string;
}

/**
 * Retimes and/or reassigns a set of selected draft Shifts in one request.
 * Only the fields the manager explicitly enables are sent, so a bulk change
 * never accidentally clears an unrelated value.
 */
export function BulkEditDialog({
	open,
	onOpenChange,
	locationId,
	weekStart,
	shiftIds,
	workers,
	teamId,
	onEdited,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	locationId: string | undefined;
	weekStart: string;
	shiftIds: string[];
	workers: BulkEditWorker[];
	teamId?: string | null;
	onEdited?: () => void;
}) {
	const [changeStart, setChangeStart] = useState(false);
	const [changeEnd, setChangeEnd] = useState(false);
	const [changeWorker, setChangeWorker] = useState(false);
	const [startMinute, setStartMinute] = useState(9 * 60);
	const [endMinute, setEndMinute] = useState(17 * 60);
	const [employmentId, setEmploymentId] = useState(UNASSIGNED);
	const wasOpen = useRef(false);

	useEffect(() => {
		if (open && !wasOpen.current) {
			setChangeStart(false);
			setChangeEnd(false);
			setChangeWorker(false);
			setStartMinute(9 * 60);
			setEndMinute(17 * 60);
			setEmploymentId(UNASSIGNED);
		}
		wasOpen.current = open;
	}, [open]);

	const bulkEdit = useMutation({
		mutationFn: () => {
			const body: {
				shiftIds: string[];
				startMinute?: number;
				endMinute?: number;
				employmentId?: string | null;
				teamId: string | null;
			} = { shiftIds, teamId: teamId ?? null };
			if (changeStart) body.startMinute = startMinute;
			if (changeEnd) body.endMinute = endMinute;
			if (changeWorker) {
				body.employmentId = employmentId === UNASSIGNED ? null : employmentId;
			}
			return api(`/v1/locations/${locationId}/schedules/${weekStart}/bulk`, {
				method: "POST",
				body,
			});
		},
		onSuccess: () => {
			toast.success(
				`Updated ${shiftIds.length} shift${shiftIds.length === 1 ? "" : "s"}.`,
			);
			onEdited?.();
			onOpenChange(false);
		},
		onError: (error) => toast.error((error as Error).message),
	});

	const count = shiftIds.length;
	const canSubmit =
		Boolean(locationId) &&
		count > 0 &&
		(changeStart || changeEnd || changeWorker) &&
		!bulkEdit.isPending;
	const workerItems = [
		{ label: "Unassigned", value: UNASSIGNED },
		...workers.map((worker) => ({
			label: worker.name,
			value: worker.employmentId,
		})),
	];

	return (
		<Dialog
			open={open}
			onOpenChange={(next) => {
				if (bulkEdit.isPending) return;
				onOpenChange(next);
			}}
		>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle>
						Bulk edit {count} shift{count === 1 ? "" : "s"}
					</DialogTitle>
					<DialogDescription>
						Only the fields you enable are changed across every selected shift.
					</DialogDescription>
				</DialogHeader>

				<div className="flex flex-col gap-4">
					<Field className="gap-2">
						<Field orientation="horizontal">
							<Checkbox
								id="bulk-change-start"
								checked={changeStart}
								onCheckedChange={() => setChangeStart((value) => !value)}
							/>
							<FieldLabel htmlFor="bulk-change-start" className="font-normal">
								Start time
							</FieldLabel>
						</Field>
						{changeStart ? (
							<TimePicker
								id="bulk-start-time"
								value={startMinute}
								onValueChange={setStartMinute}
							/>
						) : null}
					</Field>

					<Field className="gap-2">
						<Field orientation="horizontal">
							<Checkbox
								id="bulk-change-end"
								checked={changeEnd}
								onCheckedChange={() => setChangeEnd((value) => !value)}
							/>
							<FieldLabel htmlFor="bulk-change-end" className="font-normal">
								End time
							</FieldLabel>
						</Field>
						{changeEnd ? (
							<TimePicker
								id="bulk-end-time"
								value={endMinute}
								onValueChange={setEndMinute}
							/>
						) : null}
					</Field>

					<Field className="gap-2">
						<Field orientation="horizontal">
							<Checkbox
								id="bulk-change-worker"
								checked={changeWorker}
								onCheckedChange={() => setChangeWorker((value) => !value)}
							/>
							<FieldLabel htmlFor="bulk-change-worker" className="font-normal">
								Assign to worker
							</FieldLabel>
						</Field>
						{changeWorker ? (
							<Select
								items={workerItems}
								value={employmentId}
								onValueChange={(value) => setEmploymentId(value ?? UNASSIGNED)}
							>
								<SelectTrigger id="bulk-worker" className="w-full">
									<SelectValue placeholder="Choose a worker" />
								</SelectTrigger>
								<SelectContent alignItemWithTrigger={false}>
									<SelectGroup>
										{workerItems.map((item) => (
											<SelectItem key={item.value} value={item.value}>
												{item.label}
											</SelectItem>
										))}
									</SelectGroup>
								</SelectContent>
							</Select>
						) : null}
					</Field>
				</div>

				<DialogFooter>
					<Button
						type="button"
						variant="outline"
						disabled={bulkEdit.isPending}
						onClick={() => onOpenChange(false)}
					>
						Cancel
					</Button>
					<Button
						type="button"
						disabled={!canSubmit}
						onClick={() => bulkEdit.mutate()}
					>
						{bulkEdit.isPending ? <Spinner data-icon="inline-start" /> : null}
						Apply to {count} shift{count === 1 ? "" : "s"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
