import { useHeaderHeight } from "expo-router/react-navigation";
import { useEffect, useMemo, useState } from "react";
import {
	ActivityIndicator,
	FlatList,
	Keyboard,
	KeyboardAvoidingView,
	TextInput,
	View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
	AppText,
	Avatar,
	EmptyState,
	ErrorState,
	Icon,
	PressableScale,
} from "@/components/ui";
import { tapLight } from "@/lib/haptics";
import { positionColor } from "@/lib/position-color";
import {
	useConversationMessages,
	useCurrentEmployment,
	useSendConversationMessage,
	type WorkplaceMessage,
} from "@/lib/queries";
import {
	radius,
	spacing,
	type as typeRamp,
	useAppTheme,
} from "@/theme";

/** Messages from one author within this window read as a single group. */
const GROUP_WINDOW_MS = 5 * 60_000;

type Row =
	| { kind: "day"; id: string; label: string }
	| {
			kind: "message";
			id: string;
			message: WorkplaceMessage;
			mine: boolean;
			/** First message of a group: show the author's name. */
			groupStart: boolean;
			/** Last message of a group: show avatar and time. */
			groupEnd: boolean;
	  };

function dayLabel(iso: string) {
	const date = new Date(iso);
	const today = new Date();
	const yesterday = new Date();
	yesterday.setDate(today.getDate() - 1);
	if (date.toDateString() === today.toDateString()) return "Today";
	if (date.toDateString() === yesterday.toDateString()) return "Yesterday";
	return date.toLocaleDateString(undefined, {
		weekday: "short",
		month: "short",
		day: "numeric",
	});
}

function buildRows(
	messages: WorkplaceMessage[],
	myEmploymentId?: string,
): Row[] {
	const rows: Row[] = [];
	messages.forEach((message, index) => {
		const previous = messages[index - 1];
		const next = messages[index + 1];
		const day = new Date(message.createdAt).toDateString();
		if (!previous || new Date(previous.createdAt).toDateString() !== day) {
			rows.push({
				kind: "day",
				id: `day-${day}`,
				label: dayLabel(message.createdAt),
			});
		}
		const sameAuthor = (other?: WorkplaceMessage) =>
			Boolean(other) &&
			other?.author === message.author &&
			other?.authorEmploymentId === message.authorEmploymentId &&
			new Date(other.createdAt).toDateString() === day &&
			Math.abs(
				new Date(other.createdAt).getTime() -
					new Date(message.createdAt).getTime(),
			) < GROUP_WINDOW_MS;
		rows.push({
			kind: "message",
			id: message.id,
			message,
			mine:
				Boolean(myEmploymentId) &&
				message.authorEmploymentId === myEmploymentId,
			groupStart: !sameAuthor(previous),
			groupEnd: !sameAuthor(next),
		});
	});
	// Inverted list: newest first so the thread opens at the bottom.
	return rows.reverse();
}

/** Whether the software keyboard is up, so the composer can drop the home-bar inset. */
function useKeyboardVisible() {
	const [visible, setVisible] = useState(false);
	useEffect(() => {
		const ios = process.env.EXPO_OS === "ios";
		const show = Keyboard.addListener(
			ios ? "keyboardWillShow" : "keyboardDidShow",
			() => setVisible(true),
		);
		const hide = Keyboard.addListener(
			ios ? "keyboardWillHide" : "keyboardDidHide",
			() => setVisible(false),
		);
		return () => {
			show.remove();
			hide.remove();
		};
	}, []);
	return visible;
}

export function ConversationThread({
	conversationId,
}: {
	conversationId: string;
}) {
	const { theme } = useAppTheme();
	const headerHeight = useHeaderHeight();
	const insets = useSafeAreaInsets();
	const { employment } = useCurrentEmployment();
	const messages = useConversationMessages(conversationId);
	const send = useSendConversationMessage(conversationId);
	const [body, setBody] = useState("");
	const keyboardVisible = useKeyboardVisible();

	const rows = useMemo(
		() => buildRows(messages.messages, employment?.id),
		[messages.messages, employment?.id],
	);
	const canSend = body.trim().length > 0 && !send.isPending;

	function submit() {
		if (!canSend) return;
		tapLight();
		send.mutate(body.trim(), { onSuccess: () => setBody("") });
	}

	return (
		<KeyboardAvoidingView
			style={{ flex: 1, backgroundColor: theme.background }}
			// Android is edge-to-edge, so nothing resizes for the keyboard unless
			// we pad for it here too.
			behavior="padding"
			keyboardVerticalOffset={process.env.EXPO_OS === "ios" ? headerHeight : 0}
		>
			{messages.isError ? (
				<View style={{ padding: spacing.lg }}>
					<ErrorState
						error={messages.error}
						onRetry={() => void messages.refetch()}
					/>
				</View>
			) : null}

			<FlatList
				inverted
				data={rows}
				keyExtractor={(row) => row.id}
				style={{ flex: 1 }}
				contentContainerStyle={{
					paddingHorizontal: spacing.lg,
					paddingVertical: spacing.md,
					flexGrow: 1,
				}}
				keyboardDismissMode="interactive"
				keyboardShouldPersistTaps="handled"
				onEndReachedThreshold={0.3}
				onEndReached={messages.loadOlder}
				ListFooterComponent={
					messages.isFetchingPreviousPage ? (
						<ActivityIndicator
							color={theme.textSecondary}
							style={{ padding: spacing.lg }}
						/>
					) : null
				}
				ListEmptyComponent={
					messages.isLoading ? (
						<ActivityIndicator
							color={theme.textSecondary}
							style={{ padding: spacing.xxl }}
						/>
					) : (
						// Inverted lists flip the empty component too; flip it back.
						<View
							style={{
								transform: [{ scaleY: -1 }],
								flex: 1,
								justifyContent: "center",
							}}
						>
							<EmptyState
								icon="message"
								title="Say hello"
								body="Messages here are visible to everyone in this conversation."
							/>
						</View>
					)
				}
				renderItem={({ item }) =>
					item.kind === "day" ? (
						<DaySeparator label={item.label} />
					) : (
						<MessageBubble row={item} />
					)
				}
			/>

			<View
				style={{
					flexDirection: "row",
					alignItems: "flex-end",
					gap: spacing.sm,
					paddingHorizontal: spacing.md,
					paddingTop: spacing.sm,
					paddingBottom: keyboardVisible
							? spacing.sm
							: Math.max(insets.bottom, spacing.sm),
					backgroundColor: theme.surface,
					borderTopWidth: 1,
					borderTopColor: theme.separator,
				}}
			>
				<TextInput
					accessibilityLabel="Message"
					value={body}
					onChangeText={setBody}
					placeholder="Message"
					placeholderTextColor={theme.textTertiary}
					multiline
					selectionColor={theme.primary}
					style={[
						typeRamp.body,
						{
							flex: 1,
							color: theme.text,
							backgroundColor: theme.surfaceMuted,
							borderRadius: radius.lg + 4,
							borderCurve: "continuous",
							paddingHorizontal: spacing.lg,
							paddingTop: 10,
							paddingBottom: 10,
							minHeight: 40,
							maxHeight: 128,
						},
					]}
				/>
				<PressableScale
					accessibilityRole="button"
					accessibilityLabel="Send message"
					accessibilityState={{ disabled: !canSend, busy: send.isPending }}
					disabled={!canSend}
					pressedScale={0.9}
					onPress={submit}
					style={{
						width: 40,
						height: 40,
						borderRadius: 20,
						alignItems: "center",
						justifyContent: "center",
						backgroundColor: canSend ? theme.primary : theme.surfaceMuted,
					}}
				>
					{send.isPending ? (
						<ActivityIndicator size="small" color={theme.onPrimary} />
					) : (
						<Icon
							name="arrowUp"
							size={18}
							color={canSend ? theme.onPrimary : theme.textTertiary}
						/>
					)}
				</PressableScale>
			</View>
			{send.isError ? (
				<AppText
					variant="footnote"
					tone="danger"
					align="center"
					style={{ backgroundColor: theme.surface, paddingBottom: spacing.sm }}
				>
					Couldn’t send. {(send.error as Error).message}
				</AppText>
			) : null}
		</KeyboardAvoidingView>
	);
}

function DaySeparator({ label }: { label: string }) {
	return (
		<View style={{ alignItems: "center", paddingVertical: spacing.md }}>
			<AppText variant="caption" tone="tertiary" weight="600">
				{label}
			</AppText>
		</View>
	);
}

function MessageBubble({ row }: { row: Extract<Row, { kind: "message" }> }) {
	const { theme } = useAppTheme();
	const { message, mine, groupStart, groupEnd } = row;
	const time = new Date(message.createdAt).toLocaleTimeString([], {
		hour: "numeric",
		minute: "2-digit",
	});
	// Corners near the neighbouring bubble tighten so a group reads as one.
	const tight = radius.sm / 2;
	const big = radius.lg + 2;
	const corners = mine
		? {
				borderTopRightRadius: groupStart ? big : tight,
				borderBottomRightRadius: groupEnd ? big : tight,
			}
		: {
				borderTopLeftRadius: groupStart ? big : tight,
				borderBottomLeftRadius: groupEnd ? big : tight,
			};

	return (
		<View
			style={{
				flexDirection: "row",
				justifyContent: mine ? "flex-end" : "flex-start",
				alignItems: "flex-end",
				gap: spacing.sm,
				marginTop: groupStart ? spacing.sm : 2,
			}}
		>
			{!mine ? (
				<View style={{ width: 30 }}>
					{groupEnd ? (
						<Avatar
							name={message.author}
							size={30}
							color={positionColor(message.author)}
						/>
					) : null}
				</View>
			) : null}
			<View
				style={{
					maxWidth: "78%",
					gap: 3,
					alignItems: mine ? "flex-end" : "flex-start",
				}}
			>
				{groupStart && !mine ? (
					<AppText
						variant="caption"
						tone="secondary"
						style={{ paddingHorizontal: spacing.md }}
					>
						{message.author}
					</AppText>
				) : null}
				<View
					accessible
					accessibilityLabel={`${mine ? "You" : message.author}, ${time}: ${message.body}`}
					style={{
						backgroundColor: mine ? theme.primary : theme.surface,
						borderRadius: big,
						borderCurve: "continuous",
						paddingHorizontal: spacing.md + 2,
						paddingVertical: spacing.sm + 1,
						boxShadow: mine ? undefined : theme.cardShadow,
						...corners,
					}}
				>
					<AppText
						variant="body"
						color={mine ? theme.onPrimary : theme.text}
						selectable
					>
						{message.body}
					</AppText>
				</View>
				{groupEnd ? (
					<AppText
						variant="caption"
						tone="tertiary"
						tabular
						style={{ paddingHorizontal: spacing.xs }}
					>
						{time}
					</AppText>
				) : null}
			</View>
		</View>
	);
}
