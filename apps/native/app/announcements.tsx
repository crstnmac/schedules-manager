import { View } from "react-native";

import {
	Appear,
	AppText,
	Avatar,
	Card,
	CardListSkeleton,
	EmptyState,
	ErrorState,
	Screen,
} from "@/components/ui";
import { useAnnouncements, useCurrentEmployment } from "@/lib/queries";
import { spacing } from "@/theme";

export default function AnnouncementsScreen() {
	const { workplaceId } = useCurrentEmployment();
	const announcements = useAnnouncements(workplaceId);

	return (
		<Screen onRefresh={() => announcements.refetch()}>
			{announcements.isLoading ? <CardListSkeleton count={2} /> : null}
			{announcements.isError ? (
				<ErrorState
					error={announcements.error}
					onRetry={() => void announcements.refetch()}
				/>
			) : null}

			{announcements.data?.map((announcement, index) => (
				<Appear key={announcement.id} index={index}>
					<Card>
						<View
							style={{
								flexDirection: "row",
								alignItems: "center",
								gap: spacing.md,
							}}
						>
							<Avatar name={announcement.author} size={36} />
							<View style={{ flex: 1 }}>
								<AppText variant="footnote" weight="600">
									{announcement.author}
								</AppText>
								<AppText variant="caption" tone="tertiary">
									{new Date(announcement.createdAt).toLocaleDateString(
										undefined,
										{
											weekday: "short",
											month: "short",
											day: "numeric",
											year: "numeric",
										},
									)}
								</AppText>
							</View>
						</View>
						<View style={{ gap: spacing.xs }}>
							<AppText variant="headline" selectable>
								{announcement.title}
							</AppText>
							<AppText variant="subhead" tone="secondary" selectable>
								{announcement.body}
							</AppText>
						</View>
					</Card>
				</Appear>
			))}

			{announcements.data?.length === 0 ? (
				<EmptyState
					icon="megaphone"
					tone="warning"
					title="No announcements"
					body="Workplace updates from your Managers will appear here."
				/>
			) : null}
		</Screen>
	);
}
