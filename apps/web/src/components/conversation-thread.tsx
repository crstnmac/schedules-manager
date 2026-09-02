import { Avatar, AvatarFallback } from "@SchedulesManager/ui/components/avatar";
import { Badge } from "@SchedulesManager/ui/components/badge";
import { Button } from "@SchedulesManager/ui/components/button";
import {
	Bubble,
	BubbleContent,
} from "@SchedulesManager/ui/components/bubble";
import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "@SchedulesManager/ui/components/empty";
import { Input } from "@SchedulesManager/ui/components/input";
import {
	InputGroup,
	InputGroupAddon,
	InputGroupButton,
	InputGroupTextarea,
} from "@SchedulesManager/ui/components/input-group";
import {
	Marker,
	MarkerContent,
} from "@SchedulesManager/ui/components/marker";
import {
	Message,
	MessageAvatar,
	MessageContent,
	MessageFooter,
	MessageHeader,
} from "@SchedulesManager/ui/components/message";
import {
	MessageScroller,
	MessageScrollerButton,
	MessageScrollerContent,
	MessageScrollerItem,
	MessageScrollerProvider,
	MessageScrollerViewport,
} from "@SchedulesManager/ui/components/message-scroller";
import { Skeleton } from "@SchedulesManager/ui/components/skeleton";
import { Spinner } from "@SchedulesManager/ui/components/spinner";
import { cn } from "@SchedulesManager/ui/lib/utils";
import {
	ArrowLeftIcon,
	MessageSquareIcon,
	MessagesSquareIcon,
	SearchIcon,
	SendIcon,
	SquarePenIcon,
	XIcon,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import {
	AppPane,
	AppRail,
	AppSplit,
} from "@/components/app-page";
import type {
	ConversationDto,
	ConversationMessageDto,
} from "@/lib/queries";

export type MessagePerson = {
	employmentId: string;
	name: string;
	email: string;
};

function authorInitials(name: string) {
	const parts = name.trim().split(/\s+/).filter(Boolean);
	if (parts.length === 0) return "?";
	if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
	return `${parts[0]![0] ?? ""}${parts[parts.length - 1]![0] ?? ""}`.toUpperCase();
}

function dayKey(iso: string) {
	return new Date(iso).toLocaleDateString(undefined, {
		year: "numeric",
		month: "short",
		day: "numeric",
	});
}

function formatMessageTime(iso: string) {
	return new Date(iso).toLocaleTimeString(undefined, {
		hour: "numeric",
		minute: "2-digit",
	});
}

function formatThreadTime(iso: string) {
	const date = new Date(iso);
	const now = new Date();
	const sameDay =
		date.getFullYear() === now.getFullYear() &&
		date.getMonth() === now.getMonth() &&
		date.getDate() === now.getDate();
	if (sameDay) {
		return date.toLocaleTimeString(undefined, {
			hour: "numeric",
			minute: "2-digit",
		});
	}
	const yesterday = new Date(now);
	yesterday.setDate(now.getDate() - 1);
	const isYesterday =
		date.getFullYear() === yesterday.getFullYear() &&
		date.getMonth() === yesterday.getMonth() &&
		date.getDate() === yesterday.getDate();
	if (isYesterday) return "Yesterday";
	return date.toLocaleDateString(undefined, {
		month: "short",
		day: "numeric",
	});
}

function previewText(thread: ConversationDto) {
	const last = thread.lastMessage;
	if (!last) {
		return thread.kind === "workplace"
			? "No messages yet · visible to the whole team"
			: "No messages yet · say hello";
	}
	const body = last.body.replace(/\s+/g, " ").trim();
	const clipped = body.length > 72 ? `${body.slice(0, 72)}…` : body;
	return last.mine ? `You: ${clipped}` : clipped;
}

export function ConversationWorkspace({
	threads,
	threadsLoading,
	activeId,
	onSelect,
	messages,
	messagesLoading,
	currentEmploymentId,
	onSend,
	sendPending,
	railTitle = "Messages",
	railDescription = "Workplace and direct threads.",
	composePeople,
	composeLoading,
	onStartDirect,
	startDirectPending,
}: {
	threads: ConversationDto[];
	threadsLoading?: boolean;
	activeId?: string;
	onSelect: (id: string) => void;
	messages: ConversationMessageDto[];
	messagesLoading?: boolean;
	currentEmploymentId?: string | null;
	onSend: (body: string) => void;
	sendPending?: boolean;
	railTitle?: string;
	railDescription?: string;
	composePeople?: MessagePerson[];
	composeLoading?: boolean;
	onStartDirect?: (employmentId: string) => void | Promise<void>;
	startDirectPending?: boolean;
}) {
	const active =
		threads.find((thread) => thread.id === activeId) ??
		threads.find((thread) => thread.kind === "workplace") ??
		threads[0] ??
		null;
	const conversationId = active?.id;
	const [draft, setDraft] = useState("");
	const [composeOpen, setComposeOpen] = useState(false);
	const [composeQuery, setComposeQuery] = useState("");
	const composeSearchRef = useRef<HTMLInputElement>(null);
	const canCompose = Boolean(onStartDirect);

	useEffect(() => {
		if (!composeOpen) return;
		const timer = window.setTimeout(() => composeSearchRef.current?.focus(), 0);
		return () => window.clearTimeout(timer);
	}, [composeOpen]);

	const existingDirectByPerson = useMemo(() => {
		const map = new Map<string, string>();
		for (const thread of threads) {
			if (thread.kind !== "direct" || !thread.counterpart) continue;
			if (!map.has(thread.counterpart.employmentId)) {
				map.set(thread.counterpart.employmentId, thread.id);
			}
		}
		return map;
	}, [threads]);

	const filteredPeople = useMemo(() => {
		const query = composeQuery.trim().toLowerCase();
		const people = (composePeople ?? []).filter(
			(person) => person.employmentId !== currentEmploymentId,
		);
		if (!query) return people;
		return people.filter(
			(person) =>
				person.name.toLowerCase().includes(query) ||
				person.email.toLowerCase().includes(query),
		);
	}, [composePeople, composeQuery, currentEmploymentId]);

	const items = useMemo(() => {
		const rows: Array<
			| { type: "day"; id: string; label: string }
			| {
					type: "message";
					message: ConversationMessageDto;
					showIdentity: boolean;
					mine: boolean;
			  }
		> = [];
		let lastDay: string | null = null;
		let lastAuthor: string | null = null;

		for (const message of messages) {
			const day = dayKey(message.createdAt);
			if (day !== lastDay) {
				rows.push({ type: "day", id: `day-${day}`, label: day });
				lastDay = day;
				lastAuthor = null;
			}
			const mine = Boolean(
				currentEmploymentId &&
					message.authorEmploymentId === currentEmploymentId,
			);
			const showIdentity = message.authorEmploymentId !== lastAuthor;
			rows.push({ type: "message", message, showIdentity, mine });
			lastAuthor = message.authorEmploymentId;
		}
		return rows;
	}, [currentEmploymentId, messages]);

	function submit(event: React.FormEvent<HTMLFormElement>) {
		event.preventDefault();
		const next = draft.trim();
		if (!next || !conversationId || sendPending) return;
		onSend(next);
		setDraft("");
	}

	const composerPlaceholder = active
		? active.kind === "workplace"
			? "Message everyone"
			: `Message ${active.title}`
		: "Write a message";

	function closeCompose() {
		setComposeOpen(false);
		setComposeQuery("");
	}

	async function choosePerson(person: MessagePerson) {
		const existingId = existingDirectByPerson.get(person.employmentId);
		if (existingId) {
			onSelect(existingId);
			closeCompose();
			return;
		}
		if (!onStartDirect || startDirectPending) return;
		await onStartDirect(person.employmentId);
		closeCompose();
	}

	return (
		<AppSplit>
			<AppRail widthClassName="lg:w-80" className="overflow-hidden">
				{composeOpen ? (
					<>
						<header className="flex shrink-0 items-center gap-1 border-b px-2 py-2">
							<Button
								variant="ghost"
								size="icon-sm"
								aria-label="Back to threads"
								onClick={closeCompose}
							>
								<ArrowLeftIcon />
							</Button>
							<div className="min-w-0 flex-1 px-1">
								<h2 className="font-heading font-medium text-sm">
									New message
								</h2>
								<p className="text-muted-foreground text-xs/relaxed">
									Choose who to message privately.
								</p>
							</div>
							<Button
								variant="ghost"
								size="icon-sm"
								aria-label="Close"
								onClick={closeCompose}
							>
								<XIcon />
							</Button>
						</header>
						<div className="shrink-0 border-b p-2">
							<label className="relative block">
								<span className="sr-only">Search people</span>
								<SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
								<Input
									ref={composeSearchRef}
									value={composeQuery}
									onChange={(event) => setComposeQuery(event.target.value)}
									placeholder="Search by name or email"
									className="h-8 pl-8"
								/>
							</label>
						</div>
						<div
							className="flex min-h-0 flex-1 flex-col overflow-y-auto p-1.5"
							role="listbox"
							aria-label="People"
						>
							{composeLoading ? (
								<div className="flex flex-col gap-1 p-1">
									<Skeleton className="h-12" />
									<Skeleton className="h-12" />
									<Skeleton className="h-12" />
								</div>
							) : null}
							{!composeLoading && filteredPeople.length === 0 ? (
								<p className="px-3 py-8 text-center text-muted-foreground text-xs">
									{composeQuery.trim()
										? "No one matches that search."
										: "No people available to message."}
								</p>
							) : null}
							{filteredPeople.map((person) => {
								const existingId = existingDirectByPerson.get(
									person.employmentId,
								);
								return (
									<button
										key={person.employmentId}
										type="button"
										role="option"
										disabled={startDirectPending && !existingId}
										onClick={() => void choosePerson(person)}
										className="flex w-full items-center gap-3 rounded-lg px-2.5 py-2.5 text-left transition-colors hover:bg-muted/60 disabled:opacity-50"
									>
										<Avatar size="default" className="size-9">
											<AvatarFallback>
												{authorInitials(person.name)}
											</AvatarFallback>
										</Avatar>
										<span className="min-w-0 flex-1">
											<span className="block truncate font-medium text-sm">
												{person.name}
											</span>
											<span className="block truncate text-muted-foreground text-xs">
												{person.email}
											</span>
										</span>
										<span className="shrink-0 text-[0.6875rem] text-muted-foreground">
											{startDirectPending && !existingId ? (
												<Spinner className="size-3.5" />
											) : existingId ? (
												"Open"
											) : (
												"Message"
											)}
										</span>
									</button>
								);
							})}
						</div>
					</>
				) : (
					<>
						<header className="flex shrink-0 items-start gap-2 border-b px-3 py-3">
							<div className="min-w-0 flex-1 px-1">
								<h2 className="font-heading font-medium text-sm">
									{railTitle}
								</h2>
								<p className="text-muted-foreground text-xs/relaxed">
									{railDescription}
								</p>
							</div>
							{canCompose ? (
								<Button
									variant="outline"
									size="icon-sm"
									aria-label="New message"
									title="New message"
									onClick={() => setComposeOpen(true)}
								>
									<SquarePenIcon />
								</Button>
							) : null}
						</header>
						<div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
							{threadsLoading ? (
								<div className="flex flex-col gap-1 p-2">
									<Skeleton className="h-14" />
									<Skeleton className="h-14" />
									<Skeleton className="h-14" />
								</div>
							) : null}
							{!threadsLoading && threads.length === 0 ? (
								<div className="p-3">
									<Empty className="border border-dashed py-8">
										<EmptyHeader>
											<EmptyMedia variant="icon">
												<MessagesSquareIcon />
											</EmptyMedia>
											<EmptyTitle>No threads yet</EmptyTitle>
											<EmptyDescription>
												{canCompose
													? "Use New message to start a private thread, or wait for workplace chat."
													: "Workplace chat and direct messages will show up here."}
											</EmptyDescription>
										</EmptyHeader>
									</Empty>
								</div>
							) : null}
							<div className="flex flex-col gap-0.5 p-1.5">
								{threads.map((thread) => {
									const selected = thread.id === conversationId;
									const label = thread.title;
									return (
										<button
											key={thread.id}
											type="button"
											aria-current={selected ? "true" : undefined}
											onClick={() => onSelect(thread.id)}
											className={cn(
												"flex w-full items-start gap-3 rounded-lg px-2.5 py-2.5 text-left transition-colors",
												selected
													? "bg-secondary text-secondary-foreground"
													: "hover:bg-muted/60",
											)}
										>
											{thread.kind === "workplace" ? (
												<span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
													<MessageSquareIcon />
												</span>
											) : (
												<Avatar size="default" className="size-9">
													<AvatarFallback>
														{authorInitials(label)}
													</AvatarFallback>
												</Avatar>
											)}
											<span className="min-w-0 flex-1">
												<span className="flex items-baseline justify-between gap-2">
													<span className="truncate font-medium text-sm">
														{label}
													</span>
													{thread.lastMessage ? (
														<span className="shrink-0 text-[0.6875rem] text-muted-foreground tabular-nums">
															{formatThreadTime(
																thread.lastMessage.createdAt,
															)}
														</span>
													) : null}
												</span>
												<span className="mt-0.5 line-clamp-1 text-muted-foreground text-xs">
													{previewText(thread)}
												</span>
											</span>
										</button>
									);
								})}
							</div>
						</div>
					</>
				)}
			</AppRail>

			<AppPane>
				{active ? (
					<>
						<header className="flex shrink-0 items-center gap-3 border-b px-4 py-3">
							{active.kind === "workplace" ? (
								<span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
									<MessageSquareIcon />
								</span>
							) : (
								<Avatar size="default" className="size-10">
									<AvatarFallback>
										{authorInitials(active.title)}
									</AvatarFallback>
								</Avatar>
							)}
							<div className="min-w-0 flex-1">
								<div className="flex flex-wrap items-center gap-2">
									<h2 className="truncate font-heading font-medium text-sm">
										{active.title}
									</h2>
									<Badge variant="outline">
										{active.kind === "workplace" ? "Workplace" : "Direct"}
									</Badge>
								</div>
								<p className="truncate text-muted-foreground text-xs/relaxed">
									{active.kind === "workplace"
										? "Messages here are visible to everyone at this workplace."
										: active.counterpart
											? `Messaging ${active.counterpart.name} · ${active.counterpart.email}`
											: active.subtitle}
								</p>
							</div>
						</header>

						<MessageScrollerProvider autoScroll key={active.id}>
							<MessageScroller className="min-h-0 flex-1">
								<MessageScrollerViewport>
									<MessageScrollerContent className="gap-4 px-4 py-4">
										{messagesLoading ? (
											<div className="flex flex-col gap-4">
												<Skeleton className="h-16 w-3/5" />
												<Skeleton className="ml-auto h-12 w-2/5" />
												<Skeleton className="h-14 w-1/2" />
											</div>
										) : null}

										{!messagesLoading && messages.length === 0 ? (
											<div className="flex min-h-full items-center justify-center py-10">
												<Empty>
													<EmptyHeader>
														{active.kind === "direct" ? (
															<Avatar size="lg" className="mx-auto mb-2">
																<AvatarFallback>
																	{authorInitials(active.title)}
																</AvatarFallback>
															</Avatar>
														) : (
															<EmptyMedia variant="icon">
																<MessageSquareIcon />
															</EmptyMedia>
														)}
														<EmptyTitle>
															{active.kind === "direct"
																? `Message ${active.title}`
																: "Start the conversation"}
														</EmptyTitle>
														<EmptyDescription>
															{active.kind === "direct"
																? `This is a private thread with ${active.title}. Send the first message.`
																: "Send the first message to the whole workplace."}
														</EmptyDescription>
													</EmptyHeader>
												</Empty>
											</div>
										) : null}

										{!messagesLoading
											? items.map((item) =>
													item.type === "day" ? (
														<MessageScrollerItem
															key={item.id}
															messageId={item.id}
														>
															<Marker variant="separator">
																<MarkerContent>{item.label}</MarkerContent>
															</Marker>
														</MessageScrollerItem>
													) : (
														<MessageScrollerItem
															key={item.message.id}
															messageId={item.message.id}
															scrollAnchor={item.mine}
														>
															<Message align={item.mine ? "end" : "start"}>
																{!item.mine ? (
																	item.showIdentity ? (
																		<MessageAvatar>
																			<Avatar size="sm">
																				<AvatarFallback>
																					{authorInitials(item.message.author)}
																				</AvatarFallback>
																			</Avatar>
																		</MessageAvatar>
																	) : (
																		<span
																			aria-hidden
																			className="size-6 shrink-0"
																		/>
																	)
																) : null}
																<MessageContent>
																	{item.showIdentity ? (
																		<MessageHeader>
																			{item.mine ? "You" : item.message.author}
																		</MessageHeader>
																	) : null}
																	<Bubble
																		variant={item.mine ? "default" : "secondary"}
																		align={item.mine ? "end" : "start"}
																	>
																		<BubbleContent className="whitespace-pre-wrap">
																			{item.message.body}
																		</BubbleContent>
																	</Bubble>
																	<MessageFooter>
																		{formatMessageTime(item.message.createdAt)}
																	</MessageFooter>
																</MessageContent>
															</Message>
														</MessageScrollerItem>
													),
												)
											: null}
									</MessageScrollerContent>
								</MessageScrollerViewport>
								<MessageScrollerButton />
							</MessageScroller>
						</MessageScrollerProvider>

						<form
							className="shrink-0 border-t bg-background p-3"
							onSubmit={submit}
						>
							<InputGroup className="h-auto items-end">
								<InputGroupTextarea
									value={draft}
									onChange={(event) => setDraft(event.target.value)}
									placeholder={composerPlaceholder}
									aria-label={composerPlaceholder}
									rows={1}
									onKeyDown={(event) => {
										if (event.key === "Enter" && !event.shiftKey) {
											event.preventDefault();
											event.currentTarget.form?.requestSubmit();
										}
									}}
								/>
								<InputGroupAddon align="inline-end">
									<InputGroupButton
										type="submit"
										size="icon-sm"
										disabled={
											!conversationId || !draft.trim() || Boolean(sendPending)
										}
										aria-label={sendPending ? "Sending" : "Send message"}
									>
										{sendPending ? <Spinner /> : <SendIcon />}
									</InputGroupButton>
								</InputGroupAddon>
							</InputGroup>
							<p className="mt-1.5 text-muted-foreground text-xs">
								{active.kind === "direct" && active.counterpart
									? `Private with ${active.counterpart.name} · Enter to send`
									: "Visible to everyone · Enter to send · Shift+Enter for a new line"}
							</p>
						</form>
					</>
				) : (
					<div className="flex min-h-0 flex-1 items-center justify-center p-6">
						<Empty>
							<EmptyHeader>
								<EmptyMedia variant="icon">
									<MessagesSquareIcon />
								</EmptyMedia>
								<EmptyTitle>Select a conversation</EmptyTitle>
								<EmptyDescription>
									Choose who you want to message from the list.
								</EmptyDescription>
							</EmptyHeader>
						</Empty>
					</div>
				)}
			</AppPane>
		</AppSplit>
	);
}
