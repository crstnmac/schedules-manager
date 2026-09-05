export type ShiftSyncRunner<TShift> = (shifts: TShift[]) => Promise<void>;

export interface ShiftSyncCoordinator<TShift> {
	submit(shifts: TShift[], syncKey: string): void;
}

export function createShiftNotificationCoordinator<TShift>(
	run: ShiftSyncRunner<TShift>,
): ShiftSyncCoordinator<TShift> {
	let syncing = false;
	let lastSyncKey: string | null = null;
	let pending: { shifts: TShift[]; syncKey: string } | null = null;

	async function execute(shifts: TShift[], syncKey: string): Promise<void> {
		try {
			await run(shifts);
			lastSyncKey = syncKey;
		} catch (error) {
			console.warn(
				`[shift-notifications] Sync failed: ${error instanceof Error ? error.message : String(error)}`,
			);
		} finally {
			syncing = false;
			const next = pending;
			pending = null;
			if (next && next.syncKey !== lastSyncKey) {
				syncing = true;
				void execute(next.shifts, next.syncKey);
			}
		}
	}

	function submit(shifts: TShift[], syncKey: string): void {
		if (syncing) {
			pending = { shifts, syncKey };
			return;
		}
		if (syncKey === lastSyncKey) return;
		syncing = true;
		void execute(shifts, syncKey);
	}

	return { submit };
}
