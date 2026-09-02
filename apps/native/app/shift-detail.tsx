import { useLocalSearchParams, useRouter } from "expo-router";

import { ShiftDetailScreen, type WeekShift } from "@/components/worker-shifts";
import { useCurrentEmployment } from "@/lib/queries";

export default function ShiftDetailRoute() {
	const router = useRouter();
	const params = useLocalSearchParams<{
		shift: string;
		locationName?: string;
	}>();
	const { workplaceId } = useCurrentEmployment();

	let shift: WeekShift | null = null;
	try {
		shift = params.shift ? (JSON.parse(params.shift) as WeekShift) : null;
	} catch {
		shift = null;
	}

	if (!shift) {
		router.back();
		return null;
	}

	return (
		<ShiftDetailScreen
			shift={shift}
			workplaceId={workplaceId}
			locationName={params.locationName ?? null}
			onClose={() => router.back()}
		/>
	);
}
