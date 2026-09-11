import { toast } from "sonner";

import { type ImportMode, ImportSheet } from "@/components/import-sheet";

export interface WorkerImportEntry {
	line: number;
	email: string;
	name: string | null;
	position: string | null;
	location: string | null;
	token: string | null;
}

function inviteLink(token: string): string {
	return `${window.location.origin}/invite/${token}`;
}

/**
 * Bulk onboarding: creates pending worker invitations from a CSV so managers can
 * distribute the invite links. No email is queued, and every row is previewed
 * before anything is written.
 */
export function WorkerImportSheet({
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
			value: "workers",
			label: "Workers",
			importPath: `/v1/workplaces/${workplaceId}/invitations/import`,
			templatePath: `/v1/workplaces/${workplaceId}/invitations/import/template.csv`,
			templateFileName: "worker-import-template.csv",
			successNoun: "invitation(s)",
			help: (
				<p>
					Columns: <span className="font-medium">name</span>,{" "}
					<span className="font-medium">email</span>, optional{" "}
					<span className="font-medium">phone</span>,{" "}
					<span className="font-medium">position</span> and{" "}
					<span className="font-medium">location</span> (position and location
					must match Settings). Creates shareable invite links only — no email
					is sent.
				</p>
			),
		},
	];

	return (
		<ImportSheet<WorkerImportEntry>
			open={open}
			onOpenChange={onOpenChange}
			title="Import workers from CSV"
			description="Upload a CSV to create invitation links. Nothing is written until you import, and no email is sent."
			modes={modes}
			entryKey={(entry) => entry.email}
			renderEntry={(entry) => (
				<div className="min-w-0">
					<p className="truncate font-medium">{entry.name ?? entry.email}</p>
					<p className="truncate text-muted-foreground text-xs">
						{entry.name ? `${entry.email} · ` : ""}
						{[entry.position, entry.location].filter(Boolean).join(" · ") ||
							"No position or location"}
					</p>
				</div>
			)}
			onImported={onImported}
			onCommitted={(result) => {
				const links = result.entries
					.filter((entry) => entry.token)
					.map((entry) => `${entry.email},${inviteLink(entry.token as string)}`)
					.join("\n");
				if (!links) return;
				void navigator.clipboard
					.writeText(`email,invite_link\n${links}`)
					.then(() => toast.success("Invite links copied as CSV."))
					.catch(() => undefined);
			}}
		/>
	);
}
