import { ActivityIndicator, StyleSheet, Text, View } from "react-native";

import { AppScreen, Card, useAppTheme } from "@/components/ui";
import { useAnnouncements, useCurrentEmployment } from "@/lib/queries";

export default function AnnouncementsScreen() {
	const { theme } = useAppTheme();
	const { workplaceId } = useCurrentEmployment();
	const announcements = useAnnouncements(workplaceId);

	return (
		<AppScreen safeTop={false}>
			{announcements.isLoading ? (
				<ActivityIndicator color={theme.primary} />
			) : null}
			{announcements.isError ? (
				<Card>
					<Text style={{ color: theme.notification }}>
						{(announcements.error as Error).message}
					</Text>
				</Card>
			) : null}
			{announcements.data?.map((announcement) => (
				<Card key={announcement.id}>
					<Text style={[styles.title, { color: theme.text }]}>
						{announcement.title}
					</Text>
					<Text style={[styles.body, { color: theme.text }]}>
						{announcement.body}
					</Text>
					<View style={styles.metaRow}>
						<Text style={[styles.meta, { color: theme.muted }]}>
							{announcement.author}
						</Text>
						<Text style={[styles.meta, { color: theme.muted }]}>
							{new Date(announcement.createdAt).toLocaleDateString(undefined, {
								month: "short",
								day: "numeric",
								year: "numeric",
							})}
						</Text>
					</View>
				</Card>
			))}
			{announcements.data?.length === 0 ? (
				<Card>
					<Text style={[styles.title, { color: theme.text }]}>
						No Announcements
					</Text>
					<Text style={[styles.body, { color: theme.muted }]}>
						Workplace updates will appear here.
					</Text>
				</Card>
			) : null}
		</AppScreen>
	);
}

const styles = StyleSheet.create({
	title: { fontSize: 17, lineHeight: 23, fontWeight: "700" },
	body: { fontSize: 14, lineHeight: 21 },
	metaRow: {
		flexDirection: "row",
		justifyContent: "space-between",
		gap: 12,
	},
	meta: { fontSize: 12, lineHeight: 17 },
});
