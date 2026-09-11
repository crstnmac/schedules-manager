import { env } from "@SchedulesManager/env/web";
import { Badge } from "@SchedulesManager/ui/components/badge";
import { Button } from "@SchedulesManager/ui/components/button";
import { Input } from "@SchedulesManager/ui/components/input";
import { Spinner } from "@SchedulesManager/ui/components/spinner";
import {
	Tabs,
	TabsList,
	TabsTrigger,
} from "@SchedulesManager/ui/components/tabs";
import { useMutation } from "@tanstack/react-query";
import { DownloadIcon, FileUpIcon } from "lucide-react";
import { type ReactNode, useState } from "react";
import { toast } from "sonner";

import { FormSheet } from "@/components/form-sheet";
import { api } from "@/lib/api";

export interface ImportFailure {
	line: number;
	message: string;
}

export interface ImportResult<TEntry> {
	dryRun: boolean;
	total: number;
	imported: number;
	failed: ImportFailure[];
	entries: TEntry[];
}

export interface ImportMode {
	value: string;
	label: string;
	/** POST endpoint that accepts `{ csv, dryRun }`. */
	importPath: string;
	/** GET endpoint that streams the CSV template. */
	templatePath: string;
	templateFileName: string;
	/** Plural noun used in the success toast, e.g. "leave record(s)". */
	successNoun: string;
	help: ReactNode;
}

export interface ImportSheetProps<TEntry> {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	title: ReactNode;
	description?: ReactNode;
	modes: ImportMode[];
	renderEntry: (entry: TEntry) => ReactNode;
	entryKey: (entry: TEntry) => string;
	onImported: () => void;
	/** Runs after a successful commit, for domain-specific side effects. */
	onCommitted?: (result: ImportResult<TEntry>) => void;
}

/**
 * Shared CSV import sheet. Uploads a file, previews with a server-side dry run
 * (so failures are reported per source line), then commits the same file. Every
 * import that uses this gets a downloadable template for free.
 */
export function ImportSheet<TEntry>({
	open,
	onOpenChange,
	title,
	description,
	modes,
	renderEntry,
	entryKey,
	onImported,
	onCommitted,
}: ImportSheetProps<TEntry>) {
	const [mode, setMode] = useState(() => modes[0]?.value ?? "");
	const [fileName, setFileName] = useState<string | null>(null);
	const [csv, setCsv] = useState("");
	const [result, setResult] = useState<ImportResult<TEntry> | null>(null);
	const [committed, setCommitted] = useState(false);

	const activeMode = modes.find((item) => item.value === mode) ?? modes[0];

	const runImport = useMutation({
		mutationFn: (input: { dryRun: boolean }) => {
			if (!activeMode) throw new Error("No import mode selected");
			return api<{ import: ImportResult<TEntry> }>(activeMode.importPath, {
				method: "POST",
				body: { csv, dryRun: input.dryRun },
			});
		},
		onSuccess: (data, variables) => {
			setResult(data.import);
			setCommitted(!variables.dryRun);
			if (variables.dryRun) return;
			if (data.import.imported > 0) {
				onCommitted?.(data.import);
				toast.success(
					`Imported ${data.import.imported} ${activeMode.successNoun}.`,
				);
				onImported();
			}
			if (data.import.failed.length > 0) {
				toast.error(
					`${data.import.failed.length} row(s) were skipped. Review the list and import again.`,
				);
			} else if (data.import.imported > 0) {
				reset();
				onOpenChange(false);
			}
		},
		onError: (error) => toast.error((error as Error).message),
	});

	function reset() {
		setFileName(null);
		setCsv("");
		setResult(null);
		setCommitted(false);
	}

	function downloadTemplate() {
		if (!activeMode) return;
		void (async () => {
			try {
				const response = await fetch(
					`${env.VITE_SERVER_URL}${activeMode.templatePath}`,
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
				anchor.download = activeMode.templateFileName;
				anchor.click();
				URL.revokeObjectURL(url);
			} catch (error) {
				toast.error((error as Error).message);
			}
		})();
	}

	async function readFile(file: File) {
		setResult(null);
		setCommitted(false);
		setFileName(file.name);
		setCsv(await file.text());
	}

	if (!activeMode) return null;

	const importedSuffix = committed ? "Imported" : "Ready";
	const canCommit = Boolean(csv) && !committed && result !== null;

	return (
		<FormSheet
			open={open}
			onOpenChange={(next) => {
				if (!next) reset();
				onOpenChange(next);
			}}
			title={title}
			description={description}
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
							disabled={!csv || runImport.isPending}
							onClick={() => runImport.mutate({ dryRun: true })}
						>
							{runImport.isPending ? (
								<Spinner data-icon="inline-start" />
							) : null}
							Preview
						</Button>
						<Button
							type="button"
							size="sm"
							disabled={!canCommit || runImport.isPending}
							onClick={() => runImport.mutate({ dryRun: false })}
						>
							{runImport.isPending ? (
								<Spinner data-icon="inline-start" />
							) : null}
							{result
								? `${importedSuffix} ${result.imported} row(s)`
								: "Import"}
						</Button>
					</div>
				</div>
			}
		>
			{modes.length > 1 ? (
				<Tabs
					value={mode}
					onValueChange={(value) => {
						reset();
						setMode(value);
					}}
				>
					<TabsList variant="line" className="w-full justify-start">
						{modes.map((item) => (
							<TabsTrigger key={item.value} value={item.value}>
								{item.label}
							</TabsTrigger>
						))}
					</TabsList>
				</Tabs>
			) : null}

			<div className="rounded-lg border bg-muted/30 p-3 text-muted-foreground text-sm">
				{activeMode.help}
			</div>

			<div className="flex flex-col gap-2">
				<label
					htmlFor="import-sheet-file"
					className="flex min-h-24 cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed p-4 text-center text-muted-foreground text-sm hover:border-foreground/30"
				>
					<FileUpIcon className="size-5" />
					{fileName ? (
						<span className="font-medium text-foreground">{fileName}</span>
					) : (
						<span>Choose a CSV file</span>
					)}
					<input
						id="import-sheet-file"
						type="file"
						accept=".csv,text/csv"
						className="sr-only"
						onChange={(event) => {
							const file = event.target.files?.[0];
							if (file) void readFile(file);
						}}
					/>
				</label>
			</div>

			{result ? (
				<div className="flex flex-col gap-4">
					<div className="flex flex-wrap items-center gap-2">
						<Badge variant={result.imported > 0 ? "secondary" : "outline"}>
							{committed ? "Imported" : "Will import"} {result.imported}
						</Badge>
						{result.failed.length > 0 ? (
							<Badge variant="destructive">
								{result.failed.length} skipped
							</Badge>
						) : (
							<Badge variant="outline">No errors</Badge>
						)}
						<span className="text-muted-foreground text-xs">
							{result.total} data row(s)
						</span>
					</div>

					{result.entries.length > 0 ? (
						<div className="rounded-lg border">
							<ul className="divide-y text-sm">
								{result.entries.slice(0, 12).map((entry) => (
									<li
										key={entryKey(entry)}
										className="flex items-start justify-between gap-3 px-3 py-2"
									>
										{renderEntry(entry)}
									</li>
								))}
							</ul>
							{result.entries.length > 12 ? (
								<p className="border-t px-3 py-2 text-muted-foreground text-xs">
									and {result.entries.length - 12} more
								</p>
							) : null}
						</div>
					) : null}

					{result.failed.length > 0 ? (
						<div className="rounded-lg border border-destructive/40">
							<ul className="divide-y text-sm">
								{result.failed.map((failure) => (
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
			) : (
				<Input
					readOnly
					value={"Preview a file to see exactly what will be imported."}
					className="text-muted-foreground"
				/>
			)}
		</FormSheet>
	);
}
