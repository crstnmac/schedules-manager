import { env } from "@SchedulesManager/env/web";
import { Badge } from "@SchedulesManager/ui/components/badge";
import { Button } from "@SchedulesManager/ui/components/button";
import { Checkbox } from "@SchedulesManager/ui/components/checkbox";
import { Label } from "@SchedulesManager/ui/components/label";
import { Spinner } from "@SchedulesManager/ui/components/spinner";
import { useMutation } from "@tanstack/react-query";
import { DownloadIcon, FileUpIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { FormSheet } from "@/components/form-sheet";
import { api } from "@/lib/api";
import { spreadsheetRowsToCsv } from "@/lib/import-spreadsheet";

interface SalesImportFailure {
	line: number;
	message: string;
}

interface SalesImportEntry {
	line: number;
	location: string;
	date: string;
	amountCents: number;
	currentAmountCents: number | null;
	source: string | null;
	change: boolean;
}

interface SalesImportPreview {
	total: number;
	imported: number;
	changes: number;
	reviewHash: string;
	entries: SalesImportEntry[];
	failed: SalesImportFailure[];
}

const SOURCE_LABEL: Record<string, string> = {
	square: "Square",
	csv: "CSV import",
};

function formatMoney(cents: number) {
	return new Intl.NumberFormat("en-US", {
		style: "currency",
		currency: "USD",
	}).format(cents / 100);
}

/**
 * Reviewed daily sales import: rows are diffed against the stored figures
 * (manual or connector-owned) and nothing is written until the manager
 * commits with the preview hash, approving replacement of existing days.
 */
export function SalesImportSheet({
	open,
	onOpenChange,
	workplaceId,
	onImported,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	workplaceId: string;
	onImported: () => void;
}) {
	const [fileName, setFileName] = useState<string | null>(null);
	const [csv, setCsv] = useState("");
	const [preview, setPreview] = useState<SalesImportPreview | null>(null);
	const [overwrite, setOverwrite] = useState(false);

	function reset() {
		setFileName(null);
		setCsv("");
		setPreview(null);
		setOverwrite(false);
	}

	const runPreview = useMutation({
		mutationFn: () =>
			api<{ preview: SalesImportPreview }>(
				`/v1/workplaces/${workplaceId}/sales/import`,
				{ method: "POST", body: { csv, dryRun: true } },
			),
		onSuccess: (data) => {
			setPreview(data.preview);
			setOverwrite(false);
			if (data.preview.failed.length > 0) {
				toast.warning(
					`${data.preview.failed.length} row(s) will be skipped. Review the list.`,
				);
			}
		},
		onError: (error) => toast.error((error as Error).message),
	});

	const commit = useMutation({
		mutationFn: () =>
			api<{ imported: number }>(`/v1/workplaces/${workplaceId}/sales/import`, {
				method: "POST",
				body: {
					csv,
					dryRun: false,
					reviewHash: preview?.reviewHash,
					overwriteExisting: overwrite,
				},
			}),
		onSuccess: (data) => {
			toast.success(
				`Imported ${data.imported} day(s) of sales for ${new Set(preview?.entries.map((entry) => entry.location)).size} location(s).`,
			);
			onImported();
			reset();
			onOpenChange(false);
		},
		onError: (error) => toast.error((error as Error).message),
	});

	async function readFile(file: File) {
		try {
			setPreview(null);
			setFileName(file.name);
			if (/\.xlsx$/i.test(file.name)) {
				const { default: readXlsxFile } = await import("read-excel-file");
				const rows = await readXlsxFile(file);
				setCsv(spreadsheetRowsToCsv(rows));
			} else {
				setCsv(await file.text());
			}
		} catch (error) {
			setCsv("");
			toast.error(
				error instanceof Error ? error.message : "Could not read spreadsheet",
			);
		}
	}

	function downloadTemplate() {
		void (async () => {
			try {
				const response = await fetch(
					`${env.VITE_SERVER_URL}/v1/workplaces/${workplaceId}/sales/import/template.csv`,
					{ credentials: "include" },
				);
				if (!response.ok) {
					const body = (await response.json().catch(() => null)) as {
						message?: string;
					} | null;
					throw new Error(body?.message ?? "Could not download the template");
				}
				const blob = await response.blob();
				const url = URL.createObjectURL(blob);
				const anchor = document.createElement("a");
				anchor.href = url;
				anchor.download = "sales-import-template.csv";
				anchor.click();
				URL.revokeObjectURL(url);
			} catch (error) {
				toast.error((error as Error).message);
			}
		})();
	}

	const canCommit =
		preview !== null &&
		preview.imported > 0 &&
		(preview.changes === 0 || overwrite);

	return (
		<FormSheet
			open={open}
			onOpenChange={(next) => {
				if (!next) reset();
				onOpenChange(next);
			}}
			title="Import daily sales from CSV"
			description="Preview every day and amount before anything is written. Sales feed the labor percent on the schedule."
			footer={
				<div className="flex w-full flex-wrap items-center justify-between gap-2">
					<Button
						type="button"
						size="sm"
						variant="ghost"
						onClick={downloadTemplate}
					>
						<DownloadIcon data-icon="inline-start" />
						Template
					</Button>
					<div className="flex items-center gap-2">
						<Button
							type="button"
							size="sm"
							variant="outline"
							disabled={runPreview.isPending || !csv}
							onClick={() => runPreview.mutate()}
						>
							{runPreview.isPending ? (
								<Spinner data-icon="inline-start" />
							) : null}
							Preview
						</Button>
						<Button
							type="button"
							size="sm"
							disabled={commit.isPending || !canCommit}
							onClick={() => commit.mutate()}
						>
							{commit.isPending ? <Spinner data-icon="inline-start" /> : null}
							{preview ? `Import ${preview.imported} day(s)` : "Import"}
						</Button>
					</div>
				</div>
			}
		>
			<div className="rounded-lg border bg-muted/30 p-3 text-muted-foreground text-sm">
				<p>
					Columns: <span className="font-medium">location</span>,{" "}
					<span className="font-medium">date</span> (the location&apos;s
					business date), <span className="font-medium">amount</span> (net
					sales, no tips or taxes). Import never zeroes a missing day; days
					whose figure already exists need your approval to replace.
				</p>
			</div>

			<div className="flex flex-col gap-2">
				<label
					htmlFor="sales-import-file"
					className="flex min-h-24 cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed p-4 text-center text-muted-foreground text-sm [@media(hover:hover)]:hover:border-foreground/30"
				>
					<FileUpIcon className="size-5" />
					{fileName ? (
						<span className="font-medium text-foreground">{fileName}</span>
					) : (
						<span>Choose a CSV or XLSX file</span>
					)}
					<input
						id="sales-import-file"
						type="file"
						accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
						className="sr-only"
						onChange={(event) => {
							const file = event.target.files?.[0];
							if (file) void readFile(file);
						}}
					/>
				</label>
			</div>

			{preview ? (
				<div className="flex flex-col gap-4">
					<div className="flex flex-wrap items-center gap-2">
						<Badge variant={preview.imported > 0 ? "secondary" : "outline"}>
							{preview.imported} day(s) ready
						</Badge>
						{preview.changes > 0 ? (
							<Badge variant="destructive">
								{preview.changes} replace existing
							</Badge>
						) : (
							<Badge variant="outline">No existing figures replaced</Badge>
						)}
						<span className="text-muted-foreground text-xs">
							{preview.total} data row(s)
						</span>
					</div>

					{preview.entries.length > 0 ? (
						<div className="overflow-hidden rounded-lg border">
							<ul className="divide-y text-sm">
								{preview.entries.slice(0, 12).map((entry) => (
									<li
										key={`${entry.location}-${entry.date}`}
										className="flex items-center justify-between gap-3 px-3 py-2"
									>
										<div className="min-w-0">
											<p className="truncate font-medium">
												{entry.location} · {entry.date}
											</p>
											<p className="truncate text-muted-foreground text-xs">
												{entry.change
													? `Replaces ${formatMoney(entry.currentAmountCents ?? 0)}${
															entry.source
																? ` (${SOURCE_LABEL[entry.source] ?? entry.source})`
																: " (manual)"
														}`
													: entry.currentAmountCents !== null
														? "Same as the stored figure"
														: "New figure"}
											</p>
										</div>
										<span className="shrink-0 tabular-nums">
											{formatMoney(entry.amountCents)}
										</span>
									</li>
								))}
							</ul>
							{preview.entries.length > 12 ? (
								<p className="border-t px-3 py-2 text-muted-foreground text-xs">
									and {preview.entries.length - 12} more
								</p>
							) : null}
						</div>
					) : null}

					{preview.changes > 0 ? (
						<div className="flex items-start gap-2 rounded-lg border border-destructive/40 p-3">
							<Checkbox
								id="sales-import-overwrite"
								checked={overwrite}
								onCheckedChange={(checked) => setOverwrite(checked === true)}
							/>
							<Label
								htmlFor="sales-import-overwrite"
								className="font-normal text-sm leading-snug"
							>
								Replace the {preview.changes} existing day(s) above, including
								figures from manual entry or another connector.
							</Label>
						</div>
					) : null}

					{preview.failed.length > 0 ? (
						<div className="rounded-lg border border-destructive/40">
							<ul className="divide-y text-sm">
								{preview.failed.map((failure) => (
									<li
										key={`${failure.line}-${failure.message}`}
										className="flex items-start gap-3 px-3 py-2"
									>
										<span className="shrink-0 font-medium text-muted-foreground text-xs">
											Line {failure.line}
										</span>
										<span className="text-destructive">{failure.message}</span>
									</li>
								))}
							</ul>
						</div>
					) : null}
				</div>
			) : null}
		</FormSheet>
	);
}
