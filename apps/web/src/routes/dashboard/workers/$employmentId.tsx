import { Button } from "@SchedulesManager/ui/components/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@SchedulesManager/ui/components/card";
import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyTitle,
} from "@SchedulesManager/ui/components/empty";
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
import {
	Tabs,
	TabsContent,
	TabsList,
	TabsTrigger,
} from "@SchedulesManager/ui/components/tabs";
import { Textarea } from "@SchedulesManager/ui/components/textarea";
import {
	ToggleGroup,
	ToggleGroupItem,
} from "@SchedulesManager/ui/components/toggle-group";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeftIcon } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { AppDocument } from "@/components/app-page";
import { createDataColumnHelper, DataTable } from "@/components/data-table";
import { DatePicker } from "@/components/date-picker";
import { LeaveForecastTable } from "@/components/leave-forecast-table";
import { LeaveLedgerList } from "@/components/leave-ledger-list";
import {
	TablePagination,
	TableSearch,
	TableToolbar,
	useTablePagination,
} from "@/components/table-toolbar";
import { api } from "@/lib/api";
import { todayIsoDate } from "@/lib/leave";
import { hasCapability } from "@/lib/privileges";
import {
	type LeaveTypeDto,
	useLeaveForecast,
	useLeaveLedger,
	useLeaveTypes,
	usePtoBalances,
	useWorkers,
} from "@/lib/queries";
import { useDisplayPrefs } from "@/lib/use-display-prefs";
import { useWorkplace } from "@/lib/use-workplace";

export const Route = createFileRoute("/dashboard/workers/$employmentId")({
	component: EmploymentPage,
});

type LeaveTypeRow = { id: string; name: string };
type DocumentRow = {
	id: string;
	title: string;
	url: string | null;
	note: string | null;
	createdAt: string;
};

const ptoHelper = createDataColumnHelper<LeaveTypeRow>();
const documentHelper = createDataColumnHelper<DocumentRow>();

function signedHoursToMinutes(value: string) {
	const hours = Number(value);
	if (!Number.isFinite(hours)) return 0;
	return Math.round(hours * 60);
}

function WorkerLeaveSection({
	workplaceId,
	employmentId,
	leaveTypes,
}: {
	workplaceId: string;
	employmentId: string;
	leaveTypes: LeaveTypeDto[];
}) {
	const queryClient = useQueryClient();
	const [ledgerTypeId, setLedgerTypeId] = useState("all");
	const [forecastMonths, setForecastMonths] = useState(6);
	const [adjustTypeId, setAdjustTypeId] = useState("");
	const [adjustHours, setAdjustHours] = useState("");
	const [adjustDate, setAdjustDate] = useState(todayIsoDate);
	const [adjustNote, setAdjustNote] = useState("");
	const [transferFromId, setTransferFromId] = useState("");
	const [transferToId, setTransferToId] = useState("");
	const [transferHours, setTransferHours] = useState("");
	const [transferReason, setTransferReason] = useState("");
	const [encashTypeId, setEncashTypeId] = useState("");
	const [encashHours, setEncashHours] = useState("");
	const [encashNote, setEncashNote] = useState("");

	const ledger = useLeaveLedger(
		workplaceId,
		employmentId,
		ledgerTypeId === "all" ? undefined : ledgerTypeId,
	);
	const forecast = useLeaveForecast(workplaceId, employmentId, forecastMonths);

	const leaveTypeItems = leaveTypes.map((type) => ({
		label: type.name,
		value: type.id,
	}));
	const encashableTypes = leaveTypes.filter(
		(type) => type.policy?.encashmentEnabled,
	);

	function invalidateLeave() {
		queryClient.invalidateQueries({
			queryKey: ["pto", workplaceId, employmentId],
		});
		queryClient.invalidateQueries({ queryKey: ["leave-ledger"] });
		queryClient.invalidateQueries({
			queryKey: ["leave-balances", workplaceId],
		});
		queryClient.invalidateQueries({
			queryKey: ["leave-forecast", workplaceId, employmentId],
		});
	}

	const adjust = useMutation({
		mutationFn: () =>
			api(`/v1/workplaces/${workplaceId}/leave-adjustments`, {
				method: "POST",
				body: {
					employmentId,
					leaveTypeId: adjustTypeId,
					minutes: signedHoursToMinutes(adjustHours),
					effectiveDate: adjustDate || undefined,
					note: adjustNote.trim() || undefined,
				},
			}),
		onSuccess: () => {
			invalidateLeave();
			setAdjustHours("");
			setAdjustNote("");
			toast.success("Adjustment applied.");
		},
		onError: (error) => toast.error((error as Error).message),
	});

	const transfer = useMutation({
		mutationFn: () =>
			api(`/v1/workplaces/${workplaceId}/leave-transfers`, {
				method: "POST",
				body: {
					employmentId,
					fromLeaveTypeId: transferFromId,
					toLeaveTypeId: transferToId,
					minutes: signedHoursToMinutes(transferHours),
					reason: transferReason.trim() || undefined,
				},
			}),
		onSuccess: () => {
			invalidateLeave();
			setTransferHours("");
			setTransferReason("");
			toast.success("Balance transferred.");
		},
		onError: (error) => toast.error((error as Error).message),
	});

	const encash = useMutation({
		mutationFn: () =>
			api(`/v1/workplaces/${workplaceId}/leave-encashments`, {
				method: "POST",
				body: {
					employmentId,
					leaveTypeId: encashTypeId,
					minutes: signedHoursToMinutes(encashHours),
					note: encashNote.trim() || undefined,
				},
			}),
		onSuccess: () => {
			invalidateLeave();
			setEncashHours("");
			setEncashNote("");
			toast.success("Encashment requested.");
		},
		onError: (error) => toast.error((error as Error).message),
	});

	return (
		<Card>
			<CardHeader>
				<CardTitle>Leave</CardTitle>
				<CardDescription>
					Ledger, forecast, and balance actions for this employment.
				</CardDescription>
			</CardHeader>
			<CardContent>
				<Tabs defaultValue="ledger" className="gap-4">
					<TabsList variant="line">
						<TabsTrigger value="ledger">Ledger</TabsTrigger>
						<TabsTrigger value="forecast">Forecast</TabsTrigger>
						<TabsTrigger value="adjustments">Adjustments</TabsTrigger>
						<TabsTrigger value="transfer">Transfer</TabsTrigger>
						<TabsTrigger value="encash">Encash</TabsTrigger>
					</TabsList>

					<TabsContent value="ledger" className="flex flex-col gap-3">
						<div className="max-w-60">
							<Select
								items={[
									{ label: "All leave types", value: "all" },
									...leaveTypeItems,
								]}
								value={ledgerTypeId}
								onValueChange={(value) => value && setLedgerTypeId(value)}
							>
								<SelectTrigger
									className="w-full"
									aria-label="Filter ledger by leave type"
								>
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectGroup>
										<SelectItem value="all">All leave types</SelectItem>
										{leaveTypes.map((type) => (
											<SelectItem key={type.id} value={type.id}>
												{type.name}
											</SelectItem>
										))}
									</SelectGroup>
								</SelectContent>
							</Select>
						</div>
						<LeaveLedgerList
							entries={ledger.data}
							isLoading={ledger.isLoading}
						/>
					</TabsContent>

					<TabsContent value="forecast" className="flex flex-col gap-3">
						<ToggleGroup
							aria-label="Forecast horizon"
							value={[String(forecastMonths)]}
							variant="outline"
							size="sm"
							spacing={0}
							onValueChange={(value) => {
								const next = value[0];
								if (next === "6" || next === "12") {
									setForecastMonths(Number(next));
								}
							}}
						>
							<ToggleGroupItem value="6">6 months</ToggleGroupItem>
							<ToggleGroupItem value="12">12 months</ToggleGroupItem>
						</ToggleGroup>
						<LeaveForecastTable
							forecast={forecast.data}
							isLoading={forecast.isLoading}
						/>
					</TabsContent>

					<TabsContent value="adjustments">
						<FieldGroup className="grid gap-3 sm:grid-cols-2">
							<Field>
								<FieldLabel htmlFor="leave-adjust-type">Leave type</FieldLabel>
								<Select
									items={leaveTypeItems}
									value={adjustTypeId}
									onValueChange={(value) => value && setAdjustTypeId(value)}
								>
									<SelectTrigger id="leave-adjust-type" className="w-full">
										<SelectValue placeholder="Choose a leave type" />
									</SelectTrigger>
									<SelectContent>
										<SelectGroup>
											{leaveTypes.map((type) => (
												<SelectItem key={type.id} value={type.id}>
													{type.name}
												</SelectItem>
											))}
										</SelectGroup>
									</SelectContent>
								</Select>
							</Field>
							<Field>
								<FieldLabel htmlFor="leave-adjust-hours">
									Signed hours
								</FieldLabel>
								<Input
									id="leave-adjust-hours"
									type="number"
									step="0.5"
									value={adjustHours}
									onChange={(event) => setAdjustHours(event.target.value)}
									placeholder="4 or -4"
								/>
							</Field>
							<Field>
								<FieldLabel htmlFor="leave-adjust-date">
									Effective date
								</FieldLabel>
								<DatePicker
									id="leave-adjust-date"
									value={adjustDate}
									onValueChange={setAdjustDate}
								/>
							</Field>
							<Field>
								<FieldLabel htmlFor="leave-adjust-note">Note</FieldLabel>
								<Input
									id="leave-adjust-note"
									value={adjustNote}
									onChange={(event) => setAdjustNote(event.target.value)}
									placeholder="Optional"
								/>
							</Field>
							<Button
								className="self-start sm:col-span-2"
								disabled={
									adjust.isPending ||
									!adjustTypeId ||
									signedHoursToMinutes(adjustHours) === 0
								}
								onClick={() => adjust.mutate()}
							>
								{adjust.isPending ? <Spinner data-icon="inline-start" /> : null}
								Apply adjustment
							</Button>
						</FieldGroup>
					</TabsContent>

					<TabsContent value="transfer">
						<FieldGroup className="grid gap-3 sm:grid-cols-2">
							<Field>
								<FieldLabel htmlFor="leave-transfer-from">From</FieldLabel>
								<Select
									items={leaveTypeItems}
									value={transferFromId}
									onValueChange={(value) => value && setTransferFromId(value)}
								>
									<SelectTrigger id="leave-transfer-from" className="w-full">
										<SelectValue placeholder="Source leave type" />
									</SelectTrigger>
									<SelectContent>
										<SelectGroup>
											{leaveTypes.map((type) => (
												<SelectItem key={type.id} value={type.id}>
													{type.name}
												</SelectItem>
											))}
										</SelectGroup>
									</SelectContent>
								</Select>
							</Field>
							<Field>
								<FieldLabel htmlFor="leave-transfer-to">To</FieldLabel>
								<Select
									items={leaveTypeItems}
									value={transferToId}
									onValueChange={(value) => value && setTransferToId(value)}
								>
									<SelectTrigger id="leave-transfer-to" className="w-full">
										<SelectValue placeholder="Destination leave type" />
									</SelectTrigger>
									<SelectContent>
										<SelectGroup>
											{leaveTypes.map((type) => (
												<SelectItem key={type.id} value={type.id}>
													{type.name}
												</SelectItem>
											))}
										</SelectGroup>
									</SelectContent>
								</Select>
							</Field>
							<Field>
								<FieldLabel htmlFor="leave-transfer-hours">Hours</FieldLabel>
								<Input
									id="leave-transfer-hours"
									type="number"
									min={0.5}
									step="0.5"
									value={transferHours}
									onChange={(event) => setTransferHours(event.target.value)}
									placeholder="4"
								/>
							</Field>
							<Field>
								<FieldLabel htmlFor="leave-transfer-reason">
									Reason (optional)
								</FieldLabel>
								<Input
									id="leave-transfer-reason"
									value={transferReason}
									onChange={(event) => setTransferReason(event.target.value)}
								/>
							</Field>
							<Button
								className="self-start sm:col-span-2"
								disabled={
									transfer.isPending ||
									!transferFromId ||
									!transferToId ||
									transferFromId === transferToId ||
									signedHoursToMinutes(transferHours) <= 0
								}
								onClick={() => transfer.mutate()}
							>
								{transfer.isPending ? (
									<Spinner data-icon="inline-start" />
								) : null}
								Transfer balance
							</Button>
						</FieldGroup>
					</TabsContent>

					<TabsContent value="encash">
						{encashableTypes.length === 0 ? (
							<p className="text-muted-foreground text-sm">
								No leave types have encashment enabled.
							</p>
						) : (
							<FieldGroup className="grid gap-3 sm:grid-cols-2">
								<Field>
									<FieldLabel htmlFor="leave-encash-type">
										Leave type
									</FieldLabel>
									<Select
										items={encashableTypes.map((type) => ({
											label: type.name,
											value: type.id,
										}))}
										value={encashTypeId}
										onValueChange={(value) => value && setEncashTypeId(value)}
									>
										<SelectTrigger id="leave-encash-type" className="w-full">
											<SelectValue placeholder="Choose a leave type" />
										</SelectTrigger>
										<SelectContent>
											<SelectGroup>
												{encashableTypes.map((type) => (
													<SelectItem key={type.id} value={type.id}>
														{type.name}
													</SelectItem>
												))}
											</SelectGroup>
										</SelectContent>
									</Select>
								</Field>
								<Field>
									<FieldLabel htmlFor="leave-encash-hours">Hours</FieldLabel>
									<Input
										id="leave-encash-hours"
										type="number"
										min={0.5}
										step="0.5"
										value={encashHours}
										onChange={(event) => setEncashHours(event.target.value)}
										placeholder="8"
									/>
								</Field>
								<Field className="sm:col-span-2">
									<FieldLabel htmlFor="leave-encash-note">
										Note (optional)
									</FieldLabel>
									<Input
										id="leave-encash-note"
										value={encashNote}
										onChange={(event) => setEncashNote(event.target.value)}
									/>
								</Field>
								<Button
									className="self-start sm:col-span-2"
									disabled={
										encash.isPending ||
										!encashTypeId ||
										signedHoursToMinutes(encashHours) <= 0
									}
									onClick={() => encash.mutate()}
								>
									{encash.isPending ? (
										<Spinner data-icon="inline-start" />
									) : null}
									Request encashment
								</Button>
							</FieldGroup>
						)}
					</TabsContent>
				</Tabs>
			</CardContent>
		</Card>
	);
}

function EmploymentPage() {
	const { employmentId } = Route.useParams();
	const { workplace, kind, privileges } = useWorkplace();
	const { formatPerson } = useDisplayPrefs();
	const workplaceId = workplace?.id;
	const canManageLeave = hasCapability(
		{ kind: kind ?? "viewer", privileges },
		"workers.manage",
	);
	const workers = useWorkers(workplaceId);
	const worker = useMemo(
		() =>
			workers.data?.workers.find((row) => row.employmentId === employmentId) ??
			null,
		[employmentId, workers.data],
	);
	const queryClient = useQueryClient();
	const leaveTypes = useLeaveTypes(workplaceId);
	const pto = usePtoBalances(workplaceId, employmentId);
	const documents = useQuery({
		queryKey: ["employment-documents", workplaceId, employmentId],
		enabled: Boolean(workplaceId && employmentId),
		queryFn: () =>
			api<{
				documents: {
					id: string;
					title: string;
					url: string | null;
					note: string | null;
					createdAt: string;
				}[];
			}>(`/v1/workplaces/${workplaceId}/employments/${employmentId}/documents`),
	});
	const [wage, setWage] = useState("");
	const [contactName, setContactName] = useState("");
	const [contactPhone, setContactPhone] = useState("");
	const [kioskPin, setKioskPin] = useState("");
	const [ptoMinutes, setPtoMinutes] = useState<Record<string, string>>({});
	const [documentTitle, setDocumentTitle] = useState("");
	const [documentUrl, setDocumentUrl] = useState("");
	const [documentNote, setDocumentNote] = useState("");
	const [ptoSearch, setPtoSearch] = useState("");
	const [documentSearch, setDocumentSearch] = useState("");

	useEffect(() => {
		if (!worker) return;
		setWage(
			worker.hourlyWageCents == null
				? ""
				: (worker.hourlyWageCents / 100).toFixed(2),
		);
		setContactName(worker.emergencyContactName ?? "");
		setContactPhone(worker.emergencyContactPhone ?? "");
		setKioskPin("");
	}, [worker]);

	const saveProfile = useMutation({
		mutationFn: () =>
			api(`/v1/workplaces/${workplaceId}/employments/${employmentId}/profile`, {
				method: "PATCH",
				body: {
					hourlyWageCents:
						wage.trim() === "" ? null : Math.round(Number(wage) * 100),
					emergencyContactName: contactName.trim() || null,
					emergencyContactPhone: contactPhone.trim() || null,
					...(kioskPin ? { kioskPin } : {}),
				},
			}),
		onSuccess: () => {
			setKioskPin("");
			queryClient.invalidateQueries({
				queryKey: ["workplaces", workplaceId, "workers"],
			});
			toast.success("Employment profile saved.");
		},
		onError: (error) => toast.error((error as Error).message),
	});
	const savePto = useMutation({
		mutationFn: (input: { leaveTypeId: string; minutes: number }) =>
			api(`/v1/workplaces/${workplaceId}/employments/${employmentId}/pto`, {
				method: "PUT",
				body: input,
			}),
		onSuccess: (_data, variables) => {
			setPtoMinutes((values) => {
				if (!(variables.leaveTypeId in values)) return values;
				const next = { ...values };
				delete next[variables.leaveTypeId];
				return next;
			});
			queryClient.invalidateQueries({
				queryKey: ["pto", workplaceId, employmentId],
			});
			toast.success("PTO Balance saved.");
		},
		onError: (error) => toast.error((error as Error).message),
	});
	const addDocument = useMutation({
		mutationFn: () =>
			api(
				`/v1/workplaces/${workplaceId}/employments/${employmentId}/documents`,
				{
					method: "POST",
					body: {
						title: documentTitle.trim(),
						url: documentUrl.trim() || undefined,
						note: documentNote.trim() || undefined,
					},
				},
			),
		onSuccess: () => {
			setDocumentTitle("");
			setDocumentUrl("");
			setDocumentNote("");
			queryClient.invalidateQueries({
				queryKey: ["employment-documents", workplaceId, employmentId],
			});
			toast.success("Employment Document added.");
		},
		onError: (error) => toast.error((error as Error).message),
	});

	const displayName = worker
		? formatPerson(worker.profile.fullName, worker.profile.email)
		: "Worker";
	const leaveTypeRows = leaveTypes.data?.leaveTypes ?? [];
	const documentRows = documents.data?.documents ?? [];
	const ptoColumns = useMemo(
		() =>
			ptoHelper.columns([
				ptoHelper.accessor("name", {
					header: "Leave type",
					cell: ({ getValue }) => (
						<span className="font-medium">{getValue()}</span>
					),
				}),
				ptoHelper.display({
					id: "minutes",
					header: "Hours",
					enableSorting: false,
					cell: ({ row }) => {
						const current =
							pto.data?.balances.find(
								(balance) => balance.leaveTypeId === row.original.id,
							)?.minutes ?? 0;
						return (
							<Input
								id={`pto-${row.original.id}`}
								type="number"
								min={0}
								step="0.5"
								className="tabular-nums"
								value={
									ptoMinutes[row.original.id] ??
									(current / 60).toFixed(current % 60 === 0 ? 0 : 1)
								}
								onChange={(event) =>
									setPtoMinutes((values) => ({
										...values,
										[row.original.id]: event.target.value,
									}))
								}
							/>
						);
					},
				}),
				ptoHelper.display({
					id: "actions",
					header: "Actions",
					enableSorting: false,
					cell: ({ row }) => {
						const current =
							pto.data?.balances.find(
								(balance) => balance.leaveTypeId === row.original.id,
							)?.minutes ?? 0;
						return (
							<div className="flex justify-end">
								<Button
									size="sm"
									variant="outline"
									disabled={savePto.isPending}
									onClick={() =>
										savePto.mutate({
											leaveTypeId: row.original.id,
											minutes: Math.round(
												Number(ptoMinutes[row.original.id] ?? current / 60) *
													60,
											),
										})
									}
								>
									Save
								</Button>
							</div>
						);
					},
				}),
			]),
		[pto.data?.balances, ptoMinutes, savePto],
	);
	const documentColumns = useMemo(
		() =>
			documentHelper.columns([
				documentHelper.accessor("title", {
					header: "Document",
					cell: ({ getValue }) => (
						<span className="font-medium">{getValue()}</span>
					),
				}),
				documentHelper.accessor("url", {
					header: "Link",
					cell: ({ getValue }) => {
						const url = getValue();
						return url ? (
							<a
								href={url}
								target="_blank"
								rel="noreferrer"
								className="underline underline-offset-2"
							>
								Open document
							</a>
						) : (
							<span className="text-muted-foreground">—</span>
						);
					},
				}),
				documentHelper.accessor("note", {
					header: "Note",
					cell: ({ getValue }) => getValue() ?? "—",
				}),
			]),
		[],
	);

	const filteredPto = useMemo(() => {
		const term = ptoSearch.trim().toLowerCase();
		if (!term) return leaveTypeRows;
		return leaveTypeRows.filter((row) => row.name.toLowerCase().includes(term));
	}, [leaveTypeRows, ptoSearch]);
	const ptoPagination = useTablePagination(filteredPto, {
		resetKey: ptoSearch,
	});
	const filteredDocuments = useMemo(() => {
		const term = documentSearch.trim().toLowerCase();
		if (!term) return documentRows;
		return documentRows.filter((row) =>
			`${row.title} ${row.url ?? ""} ${row.note ?? ""}`
				.toLowerCase()
				.includes(term),
		);
	}, [documentRows, documentSearch]);
	const documentPagination = useTablePagination(filteredDocuments, {
		resetKey: documentSearch,
	});

	return (
		<AppDocument>
			<div className="flex flex-col gap-3">
				<Button
					variant="ghost"
					size="sm"
					className="w-fit"
					nativeButton={false}
					render={<Link to="/dashboard/workers" />}
				>
					<ArrowLeftIcon data-icon="inline-start" />
					Workers
				</Button>
				<div>
					<h1 className="font-heading font-medium text-xl tracking-tight">
						Employment
					</h1>
					<p className="text-muted-foreground text-sm">{displayName}</p>
				</div>
			</div>

			{workers.isPending ? (
				<div className="flex items-center gap-2 text-muted-foreground text-sm">
					<Spinner /> Loading worker…
				</div>
			) : null}

			{!workers.isPending && !worker ? (
				<Empty className="border border-dashed">
					<EmptyHeader>
						<EmptyTitle>Worker not found</EmptyTitle>
						<EmptyDescription>
							This employment may have been removed or you no longer have
							access.
						</EmptyDescription>
					</EmptyHeader>
					<Button
						nativeButton={false}
						render={<Link to="/dashboard/workers" />}
					>
						Back to workers
					</Button>
				</Empty>
			) : null}

			{worker ? (
				<div className="flex flex-col gap-4">
					<Card>
						<CardHeader>
							<CardTitle>Profile and wage</CardTitle>
							<CardDescription>
								Hourly rate, kiosk PIN, and emergency contact.
							</CardDescription>
						</CardHeader>
						<CardContent className="flex flex-col gap-4">
							<FieldGroup className="grid gap-3 sm:grid-cols-2">
								<Field>
									<FieldLabel htmlFor="employment-wage">
										Wage rate (dollars per hour)
									</FieldLabel>
									<Input
										id="employment-wage"
										type="number"
										min={0}
										step="0.01"
										value={wage}
										onChange={(event) => setWage(event.target.value)}
									/>
								</Field>
								<Field>
									<FieldLabel htmlFor="worker-kiosk-pin">
										Worker kiosk PIN
									</FieldLabel>
									<Input
										id="worker-kiosk-pin"
										inputMode="numeric"
										pattern="\d{4,8}"
										minLength={4}
										maxLength={8}
										value={kioskPin}
										onChange={(event) =>
											setKioskPin(event.target.value.replace(/\D/g, ""))
										}
										placeholder={
											worker.kioskEnabled ? "Enter a new PIN" : "4–8 digits"
										}
									/>
								</Field>
								<Field>
									<FieldLabel htmlFor="emergency-contact-name">
										Emergency contact name
									</FieldLabel>
									<Input
										id="emergency-contact-name"
										value={contactName}
										onChange={(event) => setContactName(event.target.value)}
									/>
								</Field>
								<Field>
									<FieldLabel htmlFor="emergency-contact-phone">
										Emergency contact phone
									</FieldLabel>
									<Input
										id="emergency-contact-phone"
										type="tel"
										value={contactPhone}
										onChange={(event) => setContactPhone(event.target.value)}
									/>
								</Field>
							</FieldGroup>
							<Button
								className="self-start"
								disabled={
									saveProfile.isPending ||
									(Boolean(kioskPin) && !/^\d{4,8}$/.test(kioskPin))
								}
								onClick={() => saveProfile.mutate()}
							>
								{saveProfile.isPending ? (
									<Spinner data-icon="inline-start" />
								) : null}
								Save employment
							</Button>
						</CardContent>
					</Card>

					<Card>
						<CardHeader>
							<CardTitle>PTO balances</CardTitle>
							<CardDescription>
								Hours remaining. Approving time off deducts from these.
							</CardDescription>
						</CardHeader>
						<CardContent className="flex flex-col">
							{leaveTypeRows.length > 0 ? (
								<TableToolbar
									embedded
									left={
										<TableSearch
											value={ptoSearch}
											onValueChange={setPtoSearch}
											placeholder="Search leave types"
										/>
									}
									right={<TablePagination {...ptoPagination} />}
								/>
							) : null}
							<DataTable
								bounded
								fill={false}
								columns={ptoColumns}
								data={ptoPagination.pageRows}
								getRowId={(row) => row.id}
								empty={
									<p className="text-muted-foreground text-sm">
										{leaveTypeRows.length === 0
											? "Add leave types in settings to track PTO here."
											: "No leave types match your search."}
									</p>
								}
							/>
						</CardContent>
					</Card>

					{canManageLeave && workplaceId ? (
						<WorkerLeaveSection
							workplaceId={workplaceId}
							employmentId={employmentId}
							leaveTypes={leaveTypeRows}
						/>
					) : null}

					<Card>
						<CardHeader>
							<CardTitle>Employment documents</CardTitle>
							<CardDescription>
								Optional links and notes for this employment.
							</CardDescription>
						</CardHeader>
						<CardContent className="flex flex-col gap-4">
							<div className="flex flex-col">
								{documentRows.length > 0 ? (
									<TableToolbar
										embedded
										left={
											<TableSearch
												value={documentSearch}
												onValueChange={setDocumentSearch}
												placeholder="Search documents"
											/>
										}
										right={<TablePagination {...documentPagination} />}
									/>
								) : null}
								<DataTable
									bounded
									fill={false}
									columns={documentColumns}
									data={documentPagination.pageRows}
									getRowId={(row) => row.id}
									empty={
										<p className="text-muted-foreground text-sm">
											{documentRows.length === 0
												? "No documents yet."
												: "No documents match your search."}
										</p>
									}
								/>
							</div>
							<FieldGroup>
								<Field>
									<FieldLabel htmlFor="document-title">Title</FieldLabel>
									<Input
										id="document-title"
										value={documentTitle}
										onChange={(event) => setDocumentTitle(event.target.value)}
									/>
								</Field>
								<Field>
									<FieldLabel htmlFor="document-url">URL (optional)</FieldLabel>
									<Input
										id="document-url"
										type="url"
										value={documentUrl}
										onChange={(event) => setDocumentUrl(event.target.value)}
									/>
								</Field>
								<Field>
									<FieldLabel htmlFor="document-note">
										Note (optional)
									</FieldLabel>
									<Textarea
										id="document-note"
										value={documentNote}
										onChange={(event) => setDocumentNote(event.target.value)}
									/>
								</Field>
							</FieldGroup>
							<Button
								variant="outline"
								className="self-start"
								disabled={!documentTitle.trim() || addDocument.isPending}
								onClick={() => addDocument.mutate()}
							>
								Add employment document
							</Button>
						</CardContent>
					</Card>
				</div>
			) : null}
		</AppDocument>
	);
}
