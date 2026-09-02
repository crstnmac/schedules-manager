import { Button } from "@SchedulesManager/ui/components/button";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";

import { env } from "@SchedulesManager/env/web";
import { AppDocument } from "@/components/app-page";
import { DatePicker } from "@/components/date-picker";
import { supabase } from "@/lib/supabase";
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

	async function download() {
		const { data } = await supabase.auth.getSession();
		const token = data.session?.access_token;
		const response = await fetch(
			`${env.VITE_SERVER_URL}/v1/workplaces/${workplace?.id}/reports/hours.csv?from=${from}&to=${to}`,
			{ headers: { authorization: `Bearer ${token}` } },
		);
		const blob = await response.blob();
		const url = URL.createObjectURL(blob);
		const link = document.createElement("a");
		link.href = url;
		link.download = `hours-${from}-${to}.csv`;
		link.click();
		URL.revokeObjectURL(url);
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
				<DatePicker value={from} onValueChange={setFrom} />
				<DatePicker value={to} onValueChange={setTo} />
				<Button onClick={() => void download()}>Download CSV</Button>
			</div>
		</AppDocument>
	);
}
