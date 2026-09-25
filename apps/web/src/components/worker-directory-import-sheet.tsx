import { Badge } from "@SchedulesManager/ui/components/badge";
import { toast } from "sonner";

import { type ImportMode, ImportSheet } from "@/components/import-sheet";

export interface DirectoryImportEntry {
	line: number;
	email: string;
	name: string | null;
	action: "hire" | "update" | "deactivate" | "pending_invitation" | "none";
	kind: string;
	locations: string[];
	positions: string[];
	changes: string[];
	employmentId: string | null;
	inviteToken: string | null;
}

const ACTION_LABEL: Record<DirectoryImportEntry["action"], string> = {
	hire: "Invite",
	update: "Update",
	deactivate: "Deactivate",
	pending_invitation: "Update invite",
	none: "No change",
};

/**
 * Reviewed directory sync: matches rows by email and shows the mapped action
 * (invite, update, deactivate, no change) before anything is committed.
 */
export function WorkerDirectoryImportSheet({
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
	const modes: ImportMode[] = [
		{
			value: "directory",
			label: "Directory",
			importPath: `/v1/workplaces/${workplaceId}/workers/directory/import`,
			templatePath: `/v1/workplaces/${workplaceId}/workers/directory/import/template.csv`,
			templateFileName: "worker-directory-template.csv",
			successNoun: "worker(s)",
			help: (
				<p>
					Rows match an existing person by{" "}
					<span className="font-medium">email</span>. New emails get an invite
					link (no email is sent); known emails update{" "}
					<span className="font-medium">kind</span>,{" "}
					<span className="font-medium">positions</span> and{" "}
					<span className="font-medium">locations</span> (multiple values
					separated by “;”), and a <span className="font-medium">status</span>{" "}
					of “deactivated” removes access. Empty columns are left unchanged.
					Names must match Settings; preview before importing.
				</p>
			),
		},
	];

	return (
		<ImportSheet<DirectoryImportEntry>
			open={open}
			onOpenChange={onOpenChange}
			title="Sync the worker directory from CSV"
			description="Every row is mapped to an action — invite, update, or deactivate — and nothing is written until you import."
			modes={modes}
			entryKey={(entry) => entry.email}
			renderEntry={(entry) => (
				<div className="flex min-w-0 flex-1 items-start justify-between gap-3">
					<div className="min-w-0">
						<p
							className="truncate font-medium"
							title={entry.name ?? entry.email}
						>
							{entry.name ?? entry.email}
						</p>
						<p
							className="truncate text-muted-foreground text-xs"
							title={entry.changes.join(" · ") || "Nothing to change"}
						>
							{entry.name ? `${entry.email} · ` : ""}
							{entry.changes.join(" · ") || "Nothing to change"}
						</p>
					</div>
					<Badge
						variant={
							entry.action === "none"
								? "outline"
								: entry.action === "deactivate"
									? "destructive"
									: "secondary"
						}
					>
						{ACTION_LABEL[entry.action]}
					</Badge>
				</div>
			)}
			onImported={onImported}
			onCommitted={(result) => {
				const links = result.entries
					.filter((entry) => entry.inviteToken)
					.map(
						(entry) =>
							`${entry.email},${window.location.origin}/invite/${entry.inviteToken}`,
					)
					.join("\n");
				if (!links) return;
				void navigator.clipboard
					.writeText(`email,invite_link\n${links}`)
					.then(() => toast.success("New invite links copied as CSV."))
					.catch(() => undefined);
			}}
		/>
	);
}
