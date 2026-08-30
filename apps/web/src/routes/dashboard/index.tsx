import {
	Card,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@SchedulesManager/ui/components/card";
import {
	Item,
	ItemContent,
	ItemDescription,
	ItemMedia,
	ItemTitle,
} from "@SchedulesManager/ui/components/item";
import { Skeleton } from "@SchedulesManager/ui/components/skeleton";
import { createFileRoute, Link } from "@tanstack/react-router";
import { MapPinIcon, TagsIcon, UserPlusIcon, UsersIcon } from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { useLocations, usePositions, useWorkers } from "@/lib/queries";
import { useWorkplace } from "@/lib/use-workplace";

export const Route = createFileRoute("/dashboard/")({ component: Overview });

function Overview() {
	const { workplace } = useWorkplace();
	const locations = useLocations(workplace?.id);
	const positions = usePositions(workplace?.id);
	const workers = useWorkers(workplace?.id);

	const isLoading =
		locations.isLoading || positions.isLoading || workers.isLoading;

	const activeWorkers =
		workers.data?.workers.filter(
			(worker) => worker.status === "active" && worker.kind === "worker",
		) ?? [];
	const pendingInvitations =
		workers.data?.invitations.filter(
			(invitation) =>
				invitation.status === "pending" &&
				new Date(invitation.expiresAt).getTime() > Date.now(),
		) ?? [];

	const stats = [
		{
			label: "Locations",
			value: locations.data?.length ?? 0,
			to: "/dashboard/settings" as const,
			icon: MapPinIcon,
		},
		{
			label: "Positions",
			value: positions.data?.length ?? 0,
			to: "/dashboard/settings" as const,
			icon: TagsIcon,
		},
		{
			label: "Active workers",
			value: activeWorkers.length,
			to: "/dashboard/workers" as const,
			icon: UsersIcon,
		},
		{
			label: "Pending invitations",
			value: pendingInvitations.length,
			to: "/dashboard/workers" as const,
			icon: UserPlusIcon,
		},
	];

	return (
		<section className="flex flex-col gap-6">
			<PageHeader
				title="Overview"
				description="A snapshot of this workplace. Open a card to manage it."
			/>
			{isLoading ? (
				<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
					{["locations", "positions", "workers", "invitations"].map((key) => (
						<Skeleton key={key} className="h-20" />
					))}
				</div>
			) : (
				<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
					{stats.map((stat) => (
						<Item
							key={stat.label}
							variant="outline"
							render={<Link to={stat.to} />}
						>
							<ItemMedia variant="icon">
								<stat.icon />
							</ItemMedia>
							<ItemContent>
								<ItemTitle className="font-medium text-2xl tabular-nums">
									{stat.value}
								</ItemTitle>
								<ItemDescription>{stat.label}</ItemDescription>
							</ItemContent>
						</Item>
					))}
				</div>
			)}
			<Card>
				<CardHeader>
					<CardTitle>Your scheduling workspace is ready</CardTitle>
					<CardDescription>
						Invite your team, collect their availability, then build and publish
						the week from the Schedule workspace.
					</CardDescription>
				</CardHeader>
			</Card>
		</section>
	);
}
