import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@SchedulesManager/ui/components/alert-dialog";
import { Button } from "@SchedulesManager/ui/components/button";
import {
	Field,
	FieldDescription,
	FieldGroup,
	FieldLabel,
} from "@SchedulesManager/ui/components/field";
import { Input } from "@SchedulesManager/ui/components/input";
import { Spinner } from "@SchedulesManager/ui/components/spinner";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import { api } from "@/lib/api";
import { type BillingSummary, useBilling } from "@/lib/queries";
import { useWorkplace } from "@/lib/use-workplace";

function money(cents: number) {
	return new Intl.NumberFormat("en-US", {
		style: "currency",
		currency: "USD",
		minimumFractionDigits: 2,
	}).format(cents / 100);
}

export function PurchaseLocationSeat({
	billing: suppliedBilling,
	onPurchased,
}: {
	billing?: BillingSummary;
	onPurchased?: () => void;
}) {
	const { workplace } = useWorkplace();
	const billingQuery = useBilling(suppliedBilling ? undefined : workplace?.id);
	const billing = suppliedBilling ?? billingQuery.data;
	const queryClient = useQueryClient();
	const [open, setOpen] = useState(false);
	const [quantityText, setQuantityText] = useState("1");
	const subscription = billing?.subscription;
	const paid = billing?.paidLocationCount;
	const canBuy =
		subscription?.status === "active" || subscription?.status === "trialing";
	const unit = subscription
		? billing?.catalog[subscription.plan][subscription.billingInterval]
		: undefined;
	const quantity = Number(quantityText);
	const validQuantity =
		/^\d+$/.test(quantityText) &&
		Number.isSafeInteger(quantity) &&
		quantity >= 1 &&
		quantity <= 1000;
	const purchase = useMutation({
		mutationFn: async (locationsToAdd: number) => {
			if (!workplace || paid == null)
				throw new Error("Billing details are unavailable");
			return api<{ paidLocationCount: number }>(
				`/v1/workplaces/${workplace.id}/billing/location-seats`,
				{
					method: "POST",
					body: { expectedPaidLocationCount: paid, quantity: locationsToAdd },
				},
			);
		},
		onSuccess: async (_, purchasedQuantity) => {
			setOpen(false);
			await queryClient.invalidateQueries({
				queryKey: ["billing", workplace?.id],
			});
			onPurchased?.();
			toast.success(
				`${purchasedQuantity} location ${purchasedQuantity === 1 ? "seat" : "seats"} added. You can now add locations.`,
			);
		},
		onError: async (error) => {
			await queryClient.invalidateQueries({
				queryKey: ["billing", workplace?.id],
			});
			toast.error(
				error instanceof Error ? error.message : "Could not add location seats",
			);
		},
	});

	if (!canBuy || paid == null || unit == null) return null;
	return (
		<>
			<Button
				type="button"
				variant="outline"
				onClick={() => {
					setQuantityText("1");
					setOpen(true);
				}}
			>
				Buy location seats
			</Button>
			<AlertDialog open={open} onOpenChange={setOpen}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Buy location seats</AlertDialogTitle>
						<AlertDialogDescription>
							Choose how many additional locations to cover with your
							subscription.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<FieldGroup>
						<Field data-invalid={!validQuantity || undefined}>
							<FieldLabel htmlFor="location-seat-quantity">
								Additional locations
							</FieldLabel>
							<Input
								id="location-seat-quantity"
								type="number"
								inputMode="numeric"
								min={1}
								max={1000}
								step={1}
								value={quantityText}
								onChange={(event) => setQuantityText(event.target.value)}
								aria-invalid={!validQuantity || undefined}
							/>
							<FieldDescription>
								Enter 1 to 1000 additional locations.
							</FieldDescription>
						</Field>
					</FieldGroup>
					{validQuantity ? (
						<p className="text-sm">
							Your paid capacity will increase from <strong>{paid}</strong> to{" "}
							<strong>{paid + quantity}</strong> locations. That is{" "}
							<strong>{money(unit * quantity)}</strong> more per{" "}
							{subscription?.billingInterval === "year" ? "year" : "month"} at{" "}
							{money(unit)} per location.
						</p>
					) : null}
					<p className="text-muted-foreground text-xs">
						Polar applies the seat change now. The prorated adjustment for the
						current period appears on your next invoice. During a free trial,
						there is no immediate charge.
					</p>
					<AlertDialogFooter>
						<AlertDialogCancel disabled={purchase.isPending}>
							Cancel
						</AlertDialogCancel>
						<AlertDialogAction
							disabled={purchase.isPending || !validQuantity}
							onClick={() => purchase.mutate(quantity)}
						>
							{purchase.isPending ? <Spinner /> : null} Confirm purchase
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</>
	);
}
