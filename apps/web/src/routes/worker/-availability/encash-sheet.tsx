import { Button } from "@SchedulesManager/ui/components/button";
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
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { FormSheet } from "@/components/form-sheet";
import { api } from "@/lib/api";
import { formatLeaveHours, hoursToMinutes } from "@/lib/leave";

export interface EncashableBalance {
	balance: { leaveTypeId: string; minutes: number };
	type: { name: string };
}

export default function EncashSheet({
	open,
	onOpenChange,
	workplaceId,
	encashableBalances,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	workplaceId: string | undefined;
	encashableBalances: EncashableBalance[];
}) {
	const queryClient = useQueryClient();
	const [chosenTypeId, setChosenTypeId] = useState("");
	const [encashHours, setEncashHours] = useState("");
	const [encashNote, setEncashNote] = useState("");
	// Opening the sheet preselects the first encashable balance.
	const encashLeaveTypeId =
		chosenTypeId || encashableBalances[0]?.balance.leaveTypeId || "";
	const setEncashLeaveTypeId = setChosenTypeId;
	const items = useMemo(
		() =>
			encashableBalances.map(({ balance, type }) => ({
				label: `${type.name} · ${formatLeaveHours(balance.minutes)} available`,
				value: balance.leaveTypeId,
			})),
		[encashableBalances],
	);
	const requestEncashment = useMutation({
		mutationFn: () =>
			api(`/v1/workplaces/${workplaceId}/my/leave-encashments`, {
				method: "POST",
				body: {
					leaveTypeId: encashLeaveTypeId,
					minutes: hoursToMinutes(encashHours),
					note: encashNote.trim() || undefined,
				},
			}),
		onSuccess: () => {
			onOpenChange(false);
			setChosenTypeId("");
			setEncashHours("");
			setEncashNote("");
			queryClient.invalidateQueries({ queryKey: ["pto", workplaceId] });
			queryClient.invalidateQueries({
				queryKey: ["constraints", workplaceId],
			});
			toast.success("Encashment requested. A manager will review it.");
		},
		onError: (error) => toast.error((error as Error).message),
	});

	return (
		<FormSheet
			open={open}
			onOpenChange={onOpenChange}
			title="Encash leave"
			description="Ask to convert unused leave minutes into pay. A manager must approve."
			footer={
				<div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
					<Button variant="outline" onClick={() => onOpenChange(false)}>
						Cancel
					</Button>
					<Button
						disabled={
							requestEncashment.isPending ||
							!encashLeaveTypeId ||
							hoursToMinutes(encashHours) <= 0
						}
						onClick={() => requestEncashment.mutate()}
					>
						{requestEncashment.isPending ? (
							<Spinner data-icon="inline-start" />
						) : null}
						Request encashment
					</Button>
				</div>
			}
		>
			<FieldGroup>
				<Field>
					<FieldLabel htmlFor="encash-type">Leave type</FieldLabel>
					<Select
						items={items}
						value={encashLeaveTypeId}
						onValueChange={(value) => value && setEncashLeaveTypeId(value)}
					>
						<SelectTrigger id="encash-type" className="w-full">
							<SelectValue placeholder="Choose a leave type" />
						</SelectTrigger>
						<SelectContent>
							<SelectGroup>
								{encashableBalances.map(({ balance, type }) => (
									<SelectItem
										key={balance.leaveTypeId}
										value={balance.leaveTypeId}
									>
										{type.name} · {formatLeaveHours(balance.minutes)} available
									</SelectItem>
								))}
							</SelectGroup>
						</SelectContent>
					</Select>
				</Field>
				<Field>
					<FieldLabel htmlFor="encash-hours">Hours to encash</FieldLabel>
					<Input
						id="encash-hours"
						type="number"
						min={0.5}
						step="0.5"
						value={encashHours}
						onChange={(event) => setEncashHours(event.target.value)}
						placeholder="8"
					/>
				</Field>
				<Field>
					<FieldLabel htmlFor="encash-note">Note (optional)</FieldLabel>
					<Input
						id="encash-note"
						value={encashNote}
						onChange={(event) => setEncashNote(event.target.value)}
						placeholder="Optional"
					/>
				</Field>
			</FieldGroup>
		</FormSheet>
	);
}
