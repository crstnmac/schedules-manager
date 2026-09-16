import {
	Alert,
	AlertDescription,
	AlertTitle,
} from "@SchedulesManager/ui/components/alert";
import {
	AlertDialog,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@SchedulesManager/ui/components/alert-dialog";
import { Badge } from "@SchedulesManager/ui/components/badge";
import { Button } from "@SchedulesManager/ui/components/button";
import { Spinner } from "@SchedulesManager/ui/components/spinner";
import {
	ToggleGroup,
	ToggleGroupItem,
} from "@SchedulesManager/ui/components/toggle-group";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { CheckIcon, CreditCardIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import {
	SettingsColumns,
	SettingsPage,
	SettingsSection,
} from "@/components/settings/page";
import { PurchaseLocationSeat } from "@/components/settings/purchase-location-seat";
import { api } from "@/lib/api";
import { useBilling, useBillingPlanState } from "@/lib/queries";
import { useWorkplace } from "@/lib/use-workplace";

export const Route = createFileRoute("/dashboard/settings/subscription")({
	component: SubscriptionPage,
});

const features = {
	schedule: [
		"Scheduling and reusable templates",
		"Versioned publishing and change history",
		"Availability, time off, open shifts, and swaps",
		"Notifications, announcements, and messaging",
		"Unlimited workers and managers",
	],
	operations: [
		"Everything in Schedule",
		"Time clock, kiosk, and geofencing",
		"Breaks, attendance, and timesheet approval",
		"Labor cost, overtime, and operational reports",
		"Auto-assign and advanced workforce controls",
	],
} as const;

function money(cents: number) {
	return new Intl.NumberFormat("en-US", {
		style: "currency",
		currency: "USD",
		maximumFractionDigits: 0,
	}).format(cents / 100);
}

type Plan = "schedule" | "operations";
type Interval = "month" | "year";
type Confirmation =
	| { plan: Plan; interval: Interval }
	| { cancel: true }
	| null;

function date(value: string | null | undefined) {
	return value
		? new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(
				new Date(value),
			)
		: "at the end of this billing period";
}

function planLabel(plan: Plan, interval: Interval) {
	return `${plan === "schedule" ? "Schedule" : "Operations"} · ${interval === "year" ? "Annual" : "Monthly"}`;
}

function changeTiming(
	currentPlan: Plan,
	currentInterval: Interval,
	targetPlan: Plan,
	targetInterval: Interval,
) {
	return currentInterval !== targetInterval ||
		(currentPlan === "operations" && targetPlan === "schedule")
		? "renewal"
		: "now";
}

function SubscriptionPage() {
	const { workplace } = useWorkplace();
	const queryClient = useQueryClient();
	const billing = useBilling(workplace?.id);
	const current = billing.data?.subscription;
	const planState = useBillingPlanState(
		workplace?.id,
		Boolean(current?.canManage),
	);
	const [interval, setInterval] = useState<Interval>("year");
	const [intervalInitialized, setIntervalInitialized] = useState(false);
	const [confirmation, setConfirmation] = useState<Confirmation>(null);

	useEffect(() => {
		if (!intervalInitialized && current?.billingInterval) {
			setInterval(current.billingInterval);
			setIntervalInitialized(true);
		}
	}, [current?.billingInterval, intervalInitialized]);

	useEffect(() => {
		if (
			new URLSearchParams(window.location.search).get("checkout") !== "success"
		)
			return;
		toast.success("Payment received. Your subscription is being activated.");
		window.history.replaceState({}, "", window.location.pathname);
		let attempts = 0;
		const timer = window.setInterval(() => {
			attempts += 1;
			void billing.refetch();
			if (attempts >= 5) window.clearInterval(timer);
		}, 2_000);
		return () => window.clearInterval(timer);
	}, [billing.refetch]);

	const checkout = useMutation({
		mutationFn: async (plan: "schedule" | "operations") => {
			if (!workplace) throw new Error("No Workplace selected");
			return api<{ url: string }>(
				`/v1/workplaces/${workplace.id}/billing/checkout`,
				{ method: "POST", body: { plan, billingInterval: interval } },
			);
		},
		onSuccess: ({ url }) => window.location.assign(url),
		onError: (error) =>
			toast.error(
				error instanceof Error ? error.message : "Could not start checkout",
			),
	});

	const portal = useMutation({
		mutationFn: async () => {
			if (!workplace) throw new Error("No Workplace selected");
			return api<{ url: string }>(
				`/v1/workplaces/${workplace.id}/billing/portal`,
				{ method: "POST" },
			);
		},
		onSuccess: ({ url }) => window.location.assign(url),
		onError: (error) =>
			toast.error(
				error instanceof Error
					? error.message
					: "Could not open billing portal",
			),
	});

	const refresh = async () => {
		await Promise.all([
			queryClient.invalidateQueries({ queryKey: ["billing", workplace?.id] }),
			queryClient.invalidateQueries({
				queryKey: ["billing-plan-state", workplace?.id],
			}),
		]);
	};

	const changePlan = useMutation({
		mutationFn: async (target: { plan: Plan; interval: Interval }) => {
			if (!workplace || !planState.data)
				throw new Error("Refresh billing before changing plans");
			return api<{ timing: "now" | "renewal" }>(
				`/v1/workplaces/${workplace.id}/billing/plan-change`,
				{
					method: "POST",
					body: {
						plan: target.plan,
						billingInterval: target.interval,
						expectedProductId: planState.data.productId,
					},
				},
			);
		},
		onSuccess: async ({ timing }) => {
			setConfirmation(null);
			await refresh();
			toast.success(
				timing === "now"
					? "Plan changed. Your next invoice will include any adjustment."
					: "Plan change scheduled for renewal.",
			);
		},
		onError: (error) => {
			void refresh();
			toast.error(
				error instanceof Error ? error.message : "Could not change plan",
			);
		},
	});

	const cancelChange = useMutation({
		mutationFn: async () => {
			if (!workplace || !planState.data?.pendingChange)
				throw new Error("No scheduled change to cancel");
			return api(`/v1/workplaces/${workplace.id}/billing/plan-change/cancel`, {
				method: "POST",
				body: { expectedPendingUpdateId: planState.data.pendingChange.id },
			});
		},
		onSuccess: async () => {
			setConfirmation(null);
			await refresh();
			toast.success("Scheduled plan change canceled.");
		},
		onError: (error) => {
			void refresh();
			toast.error(
				error instanceof Error ? error.message : "Could not cancel change",
			);
		},
	});

	const live = planState.data;
	const livePlan = live?.plan ?? current?.plan;
	const liveInterval = live?.billingInterval ?? current?.billingInterval;
	const pending = live?.pendingChange;
	const locationCount = billing.data?.locationCount ?? 0;
	const paidLocationCount =
		billing.data?.paidLocationCount ?? current?.locationCount ?? null;
	const billedLocationCount = Math.max(
		1,
		live?.seats ?? paidLocationCount ?? locationCount,
	);
	const canChangePlan = Boolean(
		live?.plan &&
			live?.billingInterval &&
			live?.status === "active" &&
			!live?.cancelAtPeriodEnd &&
			!pending,
	);
	const target = confirmation && "plan" in confirmation ? confirmation : null;
	const timing =
		target && livePlan && liveInterval
			? changeTiming(livePlan, liveInterval, target.plan, target.interval)
			: null;
	const targetTotal = target
		? (billing.data?.catalog[target.plan][target.interval] ?? 0) *
			billedLocationCount
		: 0;

	return (
		<SettingsPage
			title="Subscription"
			description="One predictable price per active location. Workers and managers are always included."
			queries={[billing]}
		>
			{current ? (
				<SettingsSection
					title="Your subscription"
					description={
						livePlan && liveInterval
							? `${planLabel(livePlan, liveInterval)} · ${current.status.replaceAll("_", " ")}`
							: current.status.replaceAll("_", " ")
					}
					action={
						current.canManage ? (
							<Button
								variant="outline"
								disabled={portal.isPending}
								onClick={() => portal.mutate()}
							>
								{portal.isPending ? (
									<Spinner data-icon="inline-start" />
								) : (
									<CreditCardIcon data-icon="inline-start" />
								)}
								Manage billing
							</Button>
						) : null
					}
				>
					<p className="text-muted-foreground text-sm">
						{current.cancelAtPeriodEnd
							? "Access ends"
							: current.status === "trialing"
								? "Trial ends"
								: "Renews"}{" "}
						{date(
							live?.trialEnd && current.status === "trialing"
								? live.trialEnd
								: (live?.currentPeriodEnd ?? current.currentPeriodEnd),
						)}
						{"."}
					</p>
					{planState.isError ? (
						<Alert variant="destructive">
							<AlertTitle>Could not verify your live subscription</AlertTitle>
							<AlertDescription>
								Plan changes are unavailable until billing syncs. Refresh this
								page or use Manage billing.
							</AlertDescription>
						</Alert>
					) : null}
					{current.status === "past_due" ? (
						<p className="text-muted-foreground text-sm">
							A payment needs attention. Resolve it in Manage billing before
							changing plans.
						</p>
					) : null}
				</SettingsSection>
			) : null}
			{pending ? (
				<SettingsSection
					title="Scheduled change"
					description={
						pending.plan && pending.billingInterval
							? `${planLabel(pending.plan, pending.billingInterval)} starts ${date(pending.appliesAt)}.`
							: `A billing change is scheduled for ${date(pending.appliesAt)}.`
					}
					action={
						pending.productId && pending.seats == null ? (
							<Button
								variant="outline"
								onClick={() => setConfirmation({ cancel: true })}
							>
								Cancel change
							</Button>
						) : null
					}
				>
					<p className="text-muted-foreground text-sm">
						Your current plan remains in place until then. Cancel this change
						before choosing another plan.
					</p>
				</SettingsSection>
			) : null}
			{current && billing.data ? (
				<SettingsSection
					title="Location seats"
					description="Buy the seats you need before adding locations."
					action={<PurchaseLocationSeat billing={billing.data} />}
				>
					<p className="text-muted-foreground text-sm">
						{locationCount} of {paidLocationCount} paid{" "}
						{paidLocationCount === 1 ? "location" : "locations"} in use.
					</p>
				</SettingsSection>
			) : null}

			<div className="flex flex-wrap items-center justify-between gap-3 border-b pb-3">
				<div>
					<h2 className="font-medium text-sm">Plans</h2>
					<p className="text-muted-foreground text-sm">
						Compare the amount for all {billedLocationCount} paid{" "}
						{billedLocationCount === 1 ? "location" : "locations"}.
					</p>
				</div>
				<div className="flex flex-wrap items-center gap-3">
					<ToggleGroup
						aria-label="Billing interval"
						value={[interval]}
						variant="outline"
						size="lg"
						spacing={0}
						onValueChange={(value) => {
							const next = value[0];
							if (next === "month" || next === "year") setInterval(next);
						}}
					>
						<ToggleGroupItem value="month">Monthly</ToggleGroupItem>
						<ToggleGroupItem value="year">
							Annual <Badge variant="secondary">Save 20%</Badge>
						</ToggleGroupItem>
					</ToggleGroup>
				</div>
			</div>

			<SettingsColumns>
				{(["schedule", "operations"] as const).map((plan) => {
					const unit = billing.data?.catalog[plan][interval] ?? 0;
					const isCurrentPlan = Boolean(
						current?.canManage &&
							livePlan === plan &&
							liveInterval === interval,
					);
					const planTiming =
						livePlan && liveInterval
							? changeTiming(livePlan, liveInterval, plan, interval)
							: null;
					return (
						<SettingsSection
							key={plan}
							title={plan === "schedule" ? "Schedule" : "Operations"}
							description={
								plan === "schedule"
									? "A dependable schedule for the whole team."
									: "Scheduling, time, attendance, and labor."
							}
							action={
								isCurrentPlan ? (
									<Badge variant="secondary">Current plan</Badge>
								) : plan === "operations" ? (
									<Badge>Recommended</Badge>
								) : null
							}
							contentClassName="flex flex-col gap-5"
						>
							<div>
								<span className="font-semibold text-3xl tracking-tight">
									{money(interval === "year" ? unit / 12 : unit)}
								</span>
								<span className="text-muted-foreground">
									{" "}
									/ location / month
								</span>
								<p className="mt-1 text-muted-foreground text-sm">
									{money(unit * billedLocationCount)}{" "}
									{interval === "year" ? "per year" : "per month"} for{" "}
									{billedLocationCount}{" "}
									{billedLocationCount === 1 ? "location" : "locations"}, before
									tax or discounts.
								</p>
							</div>
							<ul className="grid gap-2 text-sm">
								{features[plan].map((feature) => (
									<li key={feature} className="flex gap-2">
										<CheckIcon className="mt-0.5 size-4 shrink-0 text-primary" />
										<span>{feature}</span>
									</li>
								))}
							</ul>
							{!current?.canManage ? (
								<Button
									className="self-start"
									variant={plan === "operations" ? "default" : "outline"}
									disabled={checkout.isPending}
									onClick={() => checkout.mutate(plan)}
								>
									{checkout.isPending && checkout.variables === plan ? (
										<Spinner data-icon="inline-start" />
									) : null}
									{current ? "Subscribe" : "Start 30-day trial"}
								</Button>
							) : !isCurrentPlan && canChangePlan && planTiming ? (
								<Button
									className="self-start"
									variant={plan === "operations" ? "default" : "outline"}
									onClick={() => setConfirmation({ plan, interval })}
								>
									{planTiming === "now" ? "Upgrade now" : "Schedule at renewal"}
								</Button>
							) : null}
						</SettingsSection>
					);
				})}
			</SettingsColumns>
			{current?.canManage && !canChangePlan && !pending ? (
				<p className="text-muted-foreground text-sm">
					Plan changes are available for active subscriptions without a
					scheduled cancellation. Use Manage billing for payment details and
					cancellation.
				</p>
			) : null}
			<p className="text-muted-foreground text-xs">
				{current
					? "Location seats are billed separately from plan changes. Existing subscriptions may retain a different price, discount, or tax amount; your billing portal shows the invoice total."
					: "A payment method may be required for the trial. You can cancel in the billing portal before the first charge."}
			</p>

			<AlertDialog
				open={confirmation !== null}
				onOpenChange={(open) => {
					if (!open && !changePlan.isPending && !cancelChange.isPending)
						setConfirmation(null);
				}}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>
							{target
								? timing === "now"
									? "Upgrade subscription?"
									: "Schedule plan change?"
								: "Cancel scheduled change?"}
						</AlertDialogTitle>
						<AlertDialogDescription>
							{target && livePlan && liveInterval
								? `${planLabel(livePlan, liveInterval)} → ${planLabel(target.plan, target.interval)} for ${billedLocationCount} ${billedLocationCount === 1 ? "location" : "locations"}.`
								: "Your current plan will continue and no replacement plan will be scheduled."}
						</AlertDialogDescription>
					</AlertDialogHeader>
					{target ? (
						<div className="grid gap-2 text-sm">
							<p>
								Catalog rate:{" "}
								<strong>
									{money(targetTotal)}{" "}
									{target.interval === "year" ? "per year" : "per month"}
								</strong>
								, before tax or discounts.
							</p>
							<p className="text-muted-foreground">
								{timing === "now"
									? "The new plan starts now. Polar calculates any prorated difference and adds it to your next invoice; no immediate charge is requested by this change."
									: `Your current plan remains active until ${date(live?.currentPeriodEnd)}. The new rate and billing interval begin at renewal; there is no proration now.`}
							</p>
							<p className="text-muted-foreground">
								Your existing rate may differ from this catalog rate. Review
								your billing portal for final invoice amounts.
							</p>
						</div>
					) : null}
					<AlertDialogFooter>
						<AlertDialogCancel
							disabled={changePlan.isPending || cancelChange.isPending}
						>
							Keep current
						</AlertDialogCancel>
						<Button
							disabled={changePlan.isPending || cancelChange.isPending}
							onClick={() =>
								target ? changePlan.mutate(target) : cancelChange.mutate()
							}
						>
							{changePlan.isPending || cancelChange.isPending ? (
								<Spinner data-icon="inline-start" />
							) : null}
							{target
								? timing === "now"
									? "Confirm upgrade"
									: "Schedule change"
								: "Cancel scheduled change"}
						</Button>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</SettingsPage>
	);
}
