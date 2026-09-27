import { useMutation, useQueryClient } from "@tanstack/react-query";
import * as DocumentPicker from "expo-document-picker";
import { useState } from "react";
import { Alert } from "react-native";

import { api } from "@/lib/api";
import { confirmAction } from "@/lib/confirm-action";

export type TimeOffDraft = {
	leaveTypeId: string;
	startDate: string;
	endDate: string;
	reason: string;
};

function body(draft: TimeOffDraft) {
	return {
		leaveTypeId: draft.leaveTypeId,
		startDate: draft.startDate,
		endDate: draft.endDate || draft.startDate,
		allDay: true,
		reason: draft.reason.trim() || undefined,
	};
}

/** Manager-side time-off writes, shared by the queue and the add/edit sheet. */
export function useTimeOffActions(workplaceId: string | undefined) {
	const client = useQueryClient();
	const [importing, setImporting] = useState(false);

	function refresh() {
		void client.invalidateQueries({
			queryKey: ["manager", workplaceId, "time-off"],
		});
		void client.invalidateQueries({
			queryKey: ["my-pending-approvals", workplaceId],
		});
	}

	const decide = useMutation({
		mutationFn: ({
			id,
			decision,
		}: {
			id: string;
			decision: "approved" | "declined";
		}) =>
			api(`/v1/workplaces/${workplaceId}/time-off/${id}/decision`, {
				method: "POST",
				body: { decision },
			}),
		onSuccess: refresh,
		onError: (e) => Alert.alert("Could not save", (e as Error).message),
	});

	/** Approved immediately for anyone on the team; paid hours deduct. */
	const record = useMutation({
		mutationFn: (input: TimeOffDraft & { employmentId: string }) =>
			api(`/v1/workplaces/${workplaceId}/time-off`, {
				method: "POST",
				body: { employmentId: input.employmentId, ...body(input) },
			}),
		onSuccess: refresh,
		onError: (e) => Alert.alert("Could not record", (e as Error).message),
	});

	/** The Manager's own leave, pending until another Manager approves it. */
	const requestMine = useMutation({
		mutationFn: (input: TimeOffDraft) =>
			api(`/v1/workplaces/${workplaceId}/my/time-off`, {
				method: "POST",
				body: body(input),
			}),
		onSuccess: refresh,
		onError: (e) => Alert.alert("Could not request", (e as Error).message),
	});

	const saveEdit = useMutation({
		mutationFn: (input: TimeOffDraft & { id: string }) =>
			api(`/v1/workplaces/${workplaceId}/time-off/${input.id}`, {
				method: "PATCH",
				body: body(input),
			}),
		onSuccess: refresh,
		onError: (e) => Alert.alert("Could not update", (e as Error).message),
	});

	const remove = useMutation({
		mutationFn: (id: string) =>
			api(`/v1/workplaces/${workplaceId}/time-off/${id}`, { method: "DELETE" }),
		onSuccess: refresh,
		onError: (e) => Alert.alert("Could not delete", (e as Error).message),
	});

	async function commitImport(csv: string, expected: number) {
		try {
			setImporting(true);
			const result = await api<{
				import: { imported: number; failed: unknown[] };
			}>(`/v1/workplaces/${workplaceId}/time-off/import`, {
				method: "POST",
				body: { csv, dryRun: false },
			});
			refresh();
			await client.invalidateQueries({ queryKey: ["pto"] });
			Alert.alert(
				"Imported",
				`${result.import.imported} of ${expected} record(s) imported${
					result.import.failed.length > 0
						? `, ${result.import.failed.length} skipped`
						: ""
				}.`,
			);
		} catch (e) {
			Alert.alert("Could not import", (e as Error).message);
		} finally {
			setImporting(false);
		}
	}

	/** Pick a CSV, dry-run it, and confirm before anything is saved. */
	async function importCsv() {
		try {
			const picked = await DocumentPicker.getDocumentAsync({
				type: [
					"text/csv",
					"text/comma-separated-values",
					"application/csv",
					"text/plain",
				],
				copyToCacheDirectory: true,
			});
			if (picked.canceled) return;
			const asset = picked.assets[0];
			if (!asset) return;
			const csv = await (await fetch(asset.uri)).text();
			if (!csv.trim()) {
				Alert.alert("Empty file", "Choose a CSV with a header row.");
				return;
			}
			setImporting(true);
			const preview = await api<{
				import: {
					imported: number;
					failed: { line: number; message: string }[];
				};
			}>(`/v1/workplaces/${workplaceId}/time-off/import`, {
				method: "POST",
				body: { csv, dryRun: true },
			});
			const skipped = preview.import.failed
				.slice(0, 2)
				.map((failure) => `Line ${failure.line}: ${failure.message}`)
				.join("\n");
			if (preview.import.imported === 0) {
				Alert.alert(
					"Nothing to import",
					skipped || "No valid rows were found in this file.",
				);
				return;
			}
			confirmAction({
				title: `Import ${preview.import.imported} record(s)?`,
				message: skipped
					? `Skipped rows:\n${skipped}`
					: "Approved rows deduct balances; pending rows enter the approval queue.",
				confirmLabel: "Import",
				onConfirm: () => void commitImport(csv, preview.import.imported),
			});
		} catch (e) {
			Alert.alert("Could not import", (e as Error).message);
		} finally {
			setImporting(false);
		}
	}

	return {
		decide,
		record,
		requestMine,
		saveEdit,
		remove,
		importCsv,
		importing,
	};
}
