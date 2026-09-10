import {
	Alert,
	AlertDescription,
	AlertTitle,
} from "@SchedulesManager/ui/components/alert";
import { Badge } from "@SchedulesManager/ui/components/badge";
import { Button } from "@SchedulesManager/ui/components/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardFooter,
	CardHeader,
	CardTitle,
} from "@SchedulesManager/ui/components/card";
import { Spinner } from "@SchedulesManager/ui/components/spinner";
import {
	ToggleGroup,
	ToggleGroupItem,
} from "@SchedulesManager/ui/components/toggle-group";
import { useMutation } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { CheckIcon, CreditCardIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { SettingsPage } from "@/components/settings/page";
import { api } from "@/lib/api";
import { useBilling } from "@/lib/queries";
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

function SubscriptionPage() {
	const { workplace } = useWorkplace();
	const billing = useBilling(workplace?.id);
	const [interval, setInterval] = useState<"month" | "year">("year");

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

	const current = billing.data?.subscription;
	const locationCount = billing.data?.locationCount ?? 1;

	return (
		<SettingsPage
			title="Subscription"
			description="One predictable price per active location. Workers and managers are always included."
			queries={[billing]}
		>
			{current ? (
				<Alert>
					<CreditCardIcon />
					<AlertTitle className="capitalize">
						{current.plan} · {current.status.replace("_", " ")}
					</AlertTitle>
					<AlertDescription>
						{current.cancelAtPeriodEnd ? "Cancels" : "Renews"}{" "}
						{current.currentPeriodEnd
							? new Intl.DateTimeFormat(undefined, {
									dateStyle: "medium",
								}).format(new Date(current.currentPeriodEnd))
							: "after the current billing period"}
						.
					</AlertDescription>
				</Alert>
			) : null}

			<div className="flex items-center justify-between gap-4">
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
				{current?.canManage ? (
					<Button
						variant="outline"
						disabled={portal.isPending}
						onClick={() => portal.mutate()}
					>
						{portal.isPending ? <Spinner /> : <CreditCardIcon />} Manage billing
					</Button>
				) : null}
			</div>

			<div className="grid gap-4 md:grid-cols-2">
				{(["schedule", "operations"] as const).map((plan) => {
					const unit = billing.data?.catalog[plan][interval] ?? 0;
					const selected =
						current?.plan === plan && current.billingInterval === interval;
					return (
						<Card
							key={plan}
							className={plan === "operations" ? "ring-primary/40" : undefined}
						>
							<CardHeader>
								<div className="flex items-center gap-2">
									<CardTitle className="capitalize">{plan}</CardTitle>
									{plan === "operations" ? <Badge>Recommended</Badge> : null}
								</div>
								<CardDescription>
									{plan === "schedule"
										? "A dependable schedule for the whole team."
										: "Scheduling, time, attendance, and labor in one place."}
								</CardDescription>
							</CardHeader>
							<CardContent className="grid gap-5">
								<div>
									<span className="font-semibold text-3xl tracking-tight">
										{money(interval === "year" ? unit / 12 : unit)}
									</span>
									<span className="text-muted-foreground">
										{" "}
										/ location / month
									</span>
									<p className="mt-1 text-muted-foreground">
										{money(unit * locationCount)} billed{" "}
										{interval === "year" ? "annually" : "monthly"} for{" "}
										{locationCount}{" "}
										{locationCount === 1 ? "location" : "locations"}.
									</p>
								</div>
								<ul className="grid gap-2">
									{features[plan].map((feature) => (
										<li key={feature} className="flex gap-2">
											<CheckIcon className="mt-0.5 size-4 shrink-0 text-primary" />
											<span>{feature}</span>
										</li>
									))}
								</ul>
							</CardContent>
							<CardFooter>
								<Button
									className="w-full"
									variant={plan === "operations" ? "default" : "outline"}
									disabled={
										Boolean(current?.canManage) ||
										checkout.isPending ||
										selected
									}
									onClick={() => checkout.mutate(plan)}
								>
									{checkout.isPending && checkout.variables === plan ? (
										<Spinner />
									) : null}
									{selected
										? "Current plan"
										: current?.canManage
											? "Use Manage billing to change"
											: "Start 30-day trial"}
								</Button>
							</CardFooter>
						</Card>
					);
				})}
			</div>
			<p className="text-center text-muted-foreground text-xs">
				No credit card charge during the 30-day trial. Cancel any time in the
				billing portal.
			</p>
		</SettingsPage>
	);
}
