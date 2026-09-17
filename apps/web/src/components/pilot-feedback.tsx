import { Button } from "@SchedulesManager/ui/components/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@SchedulesManager/ui/components/dialog";
import {
	Field,
	FieldError,
	FieldGroup,
	FieldLabel,
} from "@SchedulesManager/ui/components/field";
import {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@SchedulesManager/ui/components/select";
import { Spinner } from "@SchedulesManager/ui/components/spinner";
import { Textarea } from "@SchedulesManager/ui/components/textarea";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouterState } from "@tanstack/react-router";
import { MessageSquareMoreIcon } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";

import { api } from "@/lib/api";

export function PilotFeedback({
	workplaceId,
	buttonClassName,
}: {
	workplaceId: string;
	buttonClassName?: string;
}) {
	const [open, setOpen] = useState(false);
	const [category, setCategory] = useState<"problem" | "idea" | "question">(
		"problem",
	);
	const [message, setMessage] = useState("");
	const [attempted, setAttempted] = useState(false);
	const messageRef = useRef<HTMLTextAreaElement>(null);
	const messageError =
		attempted && message.trim().length < 3
			? "Enter at least 3 characters so we can understand your feedback."
			: null;
	const page = useRouterState({ select: (state) => state.location.pathname });
	const queryClient = useQueryClient();
	const submit = useMutation({
		mutationFn: () =>
			api(`/v1/workplaces/${workplaceId}/feedback`, {
				method: "POST",
				body: { category, message: message.trim(), page },
			}),
		onSuccess: () => {
			setMessage("");
			setAttempted(false);
			setOpen(false);
			queryClient.invalidateQueries({
				queryKey: ["pilot-status", workplaceId],
			});
			toast.success("Thanks — your feedback was saved for the pilot team.");
		},
		onError: (error) => toast.error((error as Error).message),
	});
	const sendFeedback = () => {
		setAttempted(true);
		if (message.trim().length < 3) {
			messageRef.current?.focus();
			return;
		}
		submit.mutate();
	};
	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger
				render={
					<Button variant="outline" size="sm" className={buttonClassName} />
				}
			>
				<MessageSquareMoreIcon data-icon="inline-start" /> Pilot feedback
			</DialogTrigger>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle>Tell us what got in your way</DialogTitle>
					<DialogDescription>
						Problems, questions, and ideas go directly into this workplace’s
						pilot log.
					</DialogDescription>
				</DialogHeader>
				<FieldGroup>
					<Field>
						<FieldLabel htmlFor="pilot-feedback-type">Type</FieldLabel>
						<Select
							value={category}
							onValueChange={(value) =>
								value && setCategory(value as typeof category)
							}
						>
							<SelectTrigger id="pilot-feedback-type">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								<SelectGroup>
									<SelectItem value="problem">Something went wrong</SelectItem>
									<SelectItem value="question">I have a question</SelectItem>
									<SelectItem value="idea">I have an idea</SelectItem>
								</SelectGroup>
							</SelectContent>
						</Select>
					</Field>
					<Field data-invalid={Boolean(messageError)}>
						<FieldLabel htmlFor="pilot-feedback-message">Message</FieldLabel>
						<Textarea
							ref={messageRef}
							id="pilot-feedback-message"
							rows={7}
							value={message}
							onChange={(event) => setMessage(event.target.value)}
							placeholder="What were you trying to do, and what happened?"
							aria-invalid={Boolean(messageError)}
							aria-describedby={
								messageError ? "pilot-feedback-error" : undefined
							}
						/>
						{messageError ? (
							<FieldError id="pilot-feedback-error">{messageError}</FieldError>
						) : null}
					</Field>
				</FieldGroup>
				<DialogFooter>
					<Button disabled={submit.isPending} onClick={sendFeedback}>
						{submit.isPending ? <Spinner data-icon="inline-start" /> : null}Send
						feedback
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
