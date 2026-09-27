import { Stack } from "expo-router";

import { ManagerHome } from "@/components/manager/manager-home";
import { WorkerHome } from "@/components/worker/worker-home";
import { useCurrentEmployment } from "@/lib/queries";

export default function HomeScreen() {
	const { isManager } = useCurrentEmployment();
	return (
		<>
			<Stack.Screen options={{ title: isManager ? "Overview" : "Today" }} />
			{isManager ? <ManagerHome /> : <WorkerHome />}
		</>
	);
}
