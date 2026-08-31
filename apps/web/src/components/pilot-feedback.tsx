import { Button } from "@SchedulesManager/ui/components/button";
import {
	Field,
	FieldGroup,
	FieldLabel,
} from "@SchedulesManager/ui/components/field";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@SchedulesManager/ui/components/select";
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetFooter,
	SheetHeader,
	SheetTitle,
	SheetTrigger,
} from "@SchedulesManager/ui/components/sheet";
import { Spinner } from "@SchedulesManager/ui/components/spinner";
import { Textarea } from "@SchedulesManager/ui/components/textarea";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouterState } from "@tanstack/react-router";
import { MessageSquareMoreIcon } from "lucide-react";
import { useState } from "react";
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
			setOpen(false);
			queryClient.invalidateQueries({
				queryKey: ["pilot-status", workplaceId],
			});
			toast.success("Thanks — your feedback was saved for the pilot team.");
		},
		onError: (error) => toast.error((error as Error).message),
	});
	return (
		<Sheet open={open} onOpenChange={setOpen}>
			<SheetTrigger
				render={
					<Button variant="outline" size="sm" className={buttonClassName} />
				}
			>
				<MessageSquareMoreIcon data-icon="inline-start" /> Pilot feedback
			</SheetTrigger>
			<SheetContent className="w-full sm:max-w-md">
				<SheetHeader>
					<SheetTitle>Tell us what got in your way</SheetTitle>
					<SheetDescription>
						Problems, questions, and ideas go directly into this workplace’s
						pilot log.
					</SheetDescription>
				</SheetHeader>
				<div className="px-4">
					<FieldGroup>
						<Field>
							<FieldLabel>Type</FieldLabel>
							<Select
								value={category}
								onValueChange={(value) =>
									value && setCategory(value as typeof category)
								}
							>
								<SelectTrigger>
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="problem">Something went wrong</SelectItem>
									<SelectItem value="question">I have a question</SelectItem>
									<SelectItem value="idea">I have an idea</SelectItem>
								</SelectContent>
							</Select>
						</Field>
						<Field>
							<FieldLabel htmlFor="pilot-feedback-message">Message</FieldLabel>
							<Textarea
								id="pilot-feedback-message"
								rows={7}
								value={message}
								onChange={(event) => setMessage(event.target.value)}
								placeholder="What were you trying to do, and what happened?"
							/>
						</Field>
					</FieldGroup>
				</div>
				<SheetFooter>
					<Button
						disabled={message.trim().length < 3 || submit.isPending}
						onClick={() => submit.mutate()}
					>
						{submit.isPending ? <Spinner data-icon="inline-start" /> : null}Send
						feedback
					</Button>
				</SheetFooter>
			</SheetContent>
		</Sheet>
	);
}
