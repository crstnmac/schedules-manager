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
import { Spinner } from "@SchedulesManager/ui/components/spinner";
import { Textarea } from "@SchedulesManager/ui/components/textarea";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeftIcon } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { api } from "@/lib/api";
import {
	useLeaveTypes,
	usePtoBalances,
	useWorkers,
} from "@/lib/queries";
import { useDisplayPrefs } from "@/lib/use-display-prefs";
import { useWorkplace } from "@/lib/use-workplace";
import { AppDocument } from "@/components/app-page";
import { createDataColumnHelper, DataTable } from "@/components/data-table";

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


function EmploymentPage() {
	const { employmentId } = Route.useParams();
	const { workplace } = useWorkplace();
	const { formatPerson } = useDisplayPrefs();
	const workplaceId = workplace?.id;
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
		onSuccess: () => {
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
							This employment may have been removed or you no longer have access.
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
						<CardContent>
							<DataTable
								bounded
								fill={false}
								columns={ptoColumns}
								data={leaveTypeRows}
								getRowId={(row) => row.id}
								empty={
									<p className="text-muted-foreground text-sm">
										Add leave types in settings to track PTO here.
									</p>
								}
							/>
						</CardContent>
					</Card>

					<Card>
						<CardHeader>
							<CardTitle>Employment documents</CardTitle>
							<CardDescription>
								Optional links and notes for this employment.
							</CardDescription>
						</CardHeader>
						<CardContent className="flex flex-col gap-4">
							<DataTable
								bounded
								fill={false}
								columns={documentColumns}
								data={documentRows}
								getRowId={(row) => row.id}
								empty={
									<p className="text-muted-foreground text-sm">
										No documents yet.
									</p>
								}
							/>
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
