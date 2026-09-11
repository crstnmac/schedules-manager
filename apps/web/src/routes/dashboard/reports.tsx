import { env } from "@SchedulesManager/env/web";
import { Button } from "@SchedulesManager/ui/components/button";
import { Field, FieldLabel } from "@SchedulesManager/ui/components/field";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { AppDocument } from "@/components/app-page";
import { DatePicker } from "@/components/date-picker";
import { useWorkplace } from "@/lib/use-workplace";

export const Route = createFileRoute("/dashboard/reports")({
	component: ReportsPage,
});

function ReportsPage() {
	const { workplace } = useWorkplace();
	const [from, setFrom] = useState(() => {
		const date = new Date();
		date.setDate(date.getDate() - 14);
		return date.toLocaleDateString("sv-SE");
	});
	const [to, setTo] = useState(() => new Date().toLocaleDateString("sv-SE"));

	const [isDownloading, setIsDownloading] = useState(false);
	const invalidRange = !from || !to || from > to;

	async function download() {
		if (invalidRange || isDownloading || !workplace) return;
		setIsDownloading(true);
		try {
			const response = await fetch(
				`${env.VITE_SERVER_URL}/v1/workplaces/${workplace?.id}/reports/hours.csv?from=${from}&to=${to}`,
				{ credentials: "include" },
			);
			if (!response.ok) {
				const payload = (await response.json().catch(() => null)) as {
					message?: string;
				} | null;
				throw new Error(
					payload?.message ?? "Couldn’t download the report. Please try again.",
				);
			}
			const blob = await response.blob();
			const url = URL.createObjectURL(blob);
			const link = document.createElement("a");
			link.href = url;
			link.download = `hours-${from}-${to}.csv`;
			link.click();
			URL.revokeObjectURL(url);
			toast.success("Report downloaded");
		} catch (error) {
			toast.error(
				error instanceof Error
					? error.message
					: "Couldn’t download the report. Please try again.",
			);
		} finally {
			setIsDownloading(false);
		}
	}

	return (
		<AppDocument>
			<div>
				<h2 className="font-heading font-medium text-sm">
					Hours and labor export
				</h2>
				<p className="text-muted-foreground text-xs/relaxed">
					CSV of time entries, breaks, labor cost, timesheet approval, and
					attendance marks.
				</p>
			</div>
			<div className="grid max-w-xl gap-3">
				<Field>
					<FieldLabel htmlFor="report-from">From date</FieldLabel>
					<DatePicker
						id="report-from"
						value={from}
						onValueChange={setFrom}
						displayValue={from}
					/>
				</Field>
				<Field>
					<FieldLabel htmlFor="report-to">To date</FieldLabel>
					<DatePicker
						id="report-to"
						value={to}
						onValueChange={setTo}
						displayValue={to}
					/>
				</Field>
				{invalidRange ? (
					<p role="alert" className="text-destructive text-sm">
						Choose an end date on or after the start date.
					</p>
				) : null}
				<Button
					disabled={invalidRange || isDownloading || !workplace}
					onClick={() => void download()}
				>
					{isDownloading ? "Downloading…" : "Download CSV"}
				</Button>
			</div>
		</AppDocument>
	);
}
