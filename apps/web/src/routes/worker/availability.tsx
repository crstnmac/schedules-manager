import { Button } from "@SchedulesManager/ui/components/button";
import { Skeleton } from "@SchedulesManager/ui/components/skeleton";
import {
	Tabs,
	TabsContent,
	TabsList,
	TabsTrigger,
} from "@SchedulesManager/ui/components/tabs";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { PlusIcon } from "lucide-react";
import {
	lazy,
	Suspense,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { toast } from "sonner";
import { AppPage, AppPageBody, AppPageHeader } from "@/components/app-page";
import { UnsavedChangesGuard } from "@/components/unsaved-changes";
import { api } from "@/lib/api";
import {
	useLeaveTypes,
	useMe,
	useMyConstraints,
	usePtoBalances,
} from "@/lib/queries";
import { useWorkplace } from "@/lib/use-workplace";
import { CalendarSyncCard } from "./-availability/calendar-sync-card";
import { ForecastCard } from "./-availability/forecast-card";
import { PreferencesCard } from "./-availability/preferences-card";
import type {
	DateWindow,
	RecurringWindow,
	ServerUnavailability,
} from "./-availability/shared";
import { TimeOffCard } from "./-availability/time-off-card";
import { UnavailabilityCard } from "./-availability/unavailability-card";

// The request form is only needed once someone asks for time off.
const loadRequestSheet = () => import("./-availability/request-time-off-sheet");
const RequestTimeOffSheet = lazy(loadRequestSheet);

export const Route = createFileRoute("/worker/availability")({
	component: AvailabilityPage,
});

type AvailabilityTab = "time-off" | "forecast" | "unavailable" | "preferences";

// Tab panels stay mounted once visited (so drafts and calendar links survive
// switching tabs) but are hidden with the `hidden` attribute, which Tailwind's
// display utilities would otherwise override.
const PANEL_CLASS = "[&[hidden]]:hidden";

function AvailabilityPage() {
	const { workplace, employmentId: membershipEmploymentId } = useWorkplace();
	const workplaceId = workplace?.id;
	const canRequestTimeOff =
		workplace?.policies.workersCanRequestTimeOff ?? true;
	const constraints = useMyConstraints(workplaceId);
	const me = useMe();
	const leaveTypes = useLeaveTypes(workplaceId);
	const workerEmploymentId = me.data?.employments.find(
		(employment) =>
			employment.kind === "worker" && employment.workplace.id === workplaceId,
	)?.id;
	const employmentId =
		workerEmploymentId ?? membershipEmploymentId ?? undefined;
	const pto = usePtoBalances(workplaceId, employmentId);
	const queryClient = useQueryClient();

	const [recurring, setRecurring] = useState<RecurringWindow[]>([]);
	const [dates, setDates] = useState<DateWindow[]>([]);
	const [preference, setPreference] = useState("");
	const [requestOpen, setRequestOpen] = useState(false);
	const [requestMounted, setRequestMounted] = useState(false);
	const [visited, setVisited] = useState<ReadonlySet<AvailabilityTab>>(
		() => new Set<AvailabilityTab>(["time-off"]),
	);

	const savedSnapshot = useRef<string | null>(null);
	const appliedKey = useRef<string | null>(null);

	const constraintsData = constraints.data;
	useEffect(() => {
		const data = constraintsData;
		if (!data) return;
		// Only re-seed the drafts when the saved windows or preference actually
		// changed (e.g. cancelling a time-off request leaves them alone).
		const key = JSON.stringify([data.unavailability, data.preference]);
		if (appliedKey.current === key) return;
		appliedKey.current = key;
		const windows = data.unavailability as ServerUnavailability[];
		const nextRecurring = windows
			.filter((row) => row.kind === "recurring")
			.map((row) => ({
				id: row.id,
				weekday: row.weekday ?? 0,
				startMinute: row.startMinute,
				endMinute: row.endMinute,
				note: row.note ?? undefined,
				status: row.status,
			}));
		const nextDates = windows
			.filter((row) => row.kind === "date")
			.map((row) => ({
				id: row.id,
				date: row.date ?? "",
				startMinute: row.startMinute,
				endMinute: row.endMinute,
				note: row.note ?? undefined,
				status: row.status,
			}));
		const nextPreference = data.preference ?? "";
		setRecurring(nextRecurring);
		setDates(nextDates);
		setPreference(nextPreference);
		savedSnapshot.current = JSON.stringify({
			recurring: nextRecurring,
			dates: nextDates,
			preference: nextPreference,
		});
	}, [constraintsData]);

	const invalidate = useCallback(() => {
		queryClient.invalidateQueries({
			queryKey: ["constraints", workplaceId],
		});
	}, [queryClient, workplaceId]);

	const saveUnavailability = useMutation({
		mutationFn: () =>
			api(`/v1/workplaces/${workplaceId}/my/unavailability`, {
				method: "PUT",
				body: {
					recurring: recurring.map(
						({ weekday, startMinute, endMinute, note }) => ({
							weekday,
							startMinute,
							endMinute,
							note,
						}),
					),
					dates: dates.map(({ date, startMinute, endMinute, note }) => ({
						date,
						startMinute,
						endMinute,
						note,
					})),
				},
			}),
		onSuccess: () => {
			invalidate();
			toast.success("Unavailability saved.");
		},
		onError: (error) => toast.error((error as Error).message),
	});

	const savePreference = useMutation({
		mutationFn: () =>
			api(`/v1/workplaces/${workplaceId}/my/preference`, {
				method: "PUT",
				body: { note: preference.trim() === "" ? null : preference.trim() },
			}),
		onSuccess: () => {
			invalidate();
			toast.success("Preference saved.");
		},
		onError: (error) => toast.error((error as Error).message),
	});

	const unavailabilityDirty = useMemo(
		() =>
			savedSnapshot.current !== null &&
			JSON.stringify({ recurring, dates, preference }) !==
				savedSnapshot.current,
		[dates, preference, recurring],
	);

	const saveUnavailabilityMutate = saveUnavailability.mutate;
	const savePreferenceMutate = savePreference.mutate;
	const saveUnavailabilityNow = useCallback(
		() =>
			unavailabilityDirty
				? saveUnavailabilityMutate()
				: toast("No changes to save"),
		[saveUnavailabilityMutate, unavailabilityDirty],
	);
	const savePreferenceNow = useCallback(
		() => savePreferenceMutate(),
		[savePreferenceMutate],
	);

	const openRequest = useCallback(() => {
		setRequestMounted(true);
		setRequestOpen(true);
	}, []);

	const handleTabChange = useCallback((value: unknown) => {
		const tab = value as AvailabilityTab;
		setVisited((current) =>
			current.has(tab) ? current : new Set(current).add(tab),
		);
	}, []);

	const leaveTypeList = leaveTypes.data?.leaveTypes;
	const requestLeaveTypes = useMemo(() => leaveTypeList ?? [], [leaveTypeList]);
	const balances = pto.data?.balances;
	const requestBalances = useMemo(() => balances ?? [], [balances]);

	return (
		<AppPage>
			<UnsavedChangesGuard when={unavailabilityDirty} />
			<AppPageHeader
				title="Time off & availability"
				description="Request days off, set when you can't work, and add preferences."
				actions={
					canRequestTimeOff ? (
						<Button
							size="sm"
							onClick={openRequest}
							onPointerEnter={() => void loadRequestSheet()}
							onFocus={() => void loadRequestSheet()}
						>
							<PlusIcon data-icon="inline-start" />
							Request time off
						</Button>
					) : null
				}
			/>
			<AppPageBody scroll={false} className="gap-0">
				{constraints.isLoading ? (
					<div className="min-h-0 flex-1 overflow-y-auto p-4" role="status">
						<span className="sr-only">Loading</span>
						<Skeleton className="h-40" />
					</div>
				) : (
					<Tabs
						defaultValue="time-off"
						onValueChange={handleTabChange}
						className="min-h-0 flex-1 flex-col gap-0"
					>
						<div className="shrink-0 border-b px-4">
							<TabsList variant="line">
								<TabsTrigger value="time-off">Time off</TabsTrigger>
								<TabsTrigger value="forecast">Forecast</TabsTrigger>
								<TabsTrigger value="unavailable">When I can't work</TabsTrigger>
								<TabsTrigger value="preferences">Preferences</TabsTrigger>
							</TabsList>
						</div>

						<div className="min-h-0 flex-1 overflow-y-auto">
							<TabsContent
								value="time-off"
								keepMounted
								className={`flex flex-col gap-4 ${PANEL_CLASS}`}
							>
								<TimeOffCard
									workplaceId={workplaceId}
									canRequestTimeOff={canRequestTimeOff}
									timeOffRows={constraintsData?.timeOff}
									timeZone={constraintsData?.timezone}
									leaveTypes={leaveTypeList}
									balances={balances}
								/>
								<CalendarSyncCard
									workplaceId={workplaceId}
									membershipEmploymentId={membershipEmploymentId}
								/>
							</TabsContent>

							<TabsContent value="forecast" keepMounted className={PANEL_CLASS}>
								{visited.has("forecast") ? (
									<ForecastCard
										workplaceId={workplaceId}
										employmentId={employmentId}
									/>
								) : null}
							</TabsContent>

							<TabsContent
								value="unavailable"
								keepMounted
								className={PANEL_CLASS}
							>
								{visited.has("unavailable") ? (
									<UnavailabilityCard
										recurring={recurring}
										dates={dates}
										setRecurring={setRecurring}
										setDates={setDates}
										dirty={unavailabilityDirty}
										saving={saveUnavailability.isPending}
										onSave={saveUnavailabilityNow}
									/>
								) : null}
							</TabsContent>

							<TabsContent
								value="preferences"
								keepMounted
								className={PANEL_CLASS}
							>
								{visited.has("preferences") ? (
									<PreferencesCard
										preference={preference}
										onPreferenceChange={setPreference}
										saving={savePreference.isPending}
										onSave={savePreferenceNow}
									/>
								) : null}
							</TabsContent>
						</div>
					</Tabs>
				)}
				{requestMounted ? (
					<Suspense fallback={null}>
						<RequestTimeOffSheet
							open={requestOpen}
							onOpenChange={setRequestOpen}
							workplaceId={workplaceId}
							leaveTypes={requestLeaveTypes}
							balances={requestBalances}
							timeZone={constraintsData?.timezone}
							onSubmitted={invalidate}
						/>
					</Suspense>
				) : null}
			</AppPageBody>
		</AppPage>
	);
}
