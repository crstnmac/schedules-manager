import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import {
	ActivityIndicator,
	Pressable,
	StyleSheet,
	Text,
	View,
} from "react-native";

import { AppScreen, Card, PageHeader, useAppTheme } from "@/components/ui";
import { useAnnouncements, useCurrentEmployment } from "@/lib/queries";

export default function AnnouncementsScreen() {
	const { theme } = useAppTheme();
	const router = useRouter();
	const { workplaceId } = useCurrentEmployment();
	const announcements = useAnnouncements(workplaceId);

	return (
		<AppScreen>
			<Pressable
				accessibilityRole="button"
				accessibilityLabel="Go back"
				onPress={() => router.back()}
				style={styles.backRow}
			>
				<Ionicons name="chevron-back" size={20} color={theme.primary} />
				<Text style={[styles.backText, { color: theme.primary }]}>More</Text>
			</Pressable>
			<PageHeader
				eyebrow="WORKPLACE"
				title="Announcements"
				description="Updates shared with everyone at your Workplace."
			/>

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
	backRow: {
		minHeight: 44,
		flexDirection: "row",
		alignItems: "center",
		gap: 4,
	},
	backText: { fontSize: 15, fontWeight: "600" },
	title: { fontSize: 17, lineHeight: 23, fontWeight: "700" },
	body: { fontSize: 14, lineHeight: 21 },
	metaRow: {
		flexDirection: "row",
		justifyContent: "space-between",
		gap: 12,
	},
	meta: { fontSize: 12, lineHeight: 17 },
});
