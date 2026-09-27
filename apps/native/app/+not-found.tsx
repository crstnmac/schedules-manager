import { router, Stack } from "expo-router";

import { Button, EmptyState, Screen } from "@/components/ui";

export default function NotFoundScreen() {
	return (
		<>
			<Stack.Screen options={{ title: "Not found" }} />
			<Screen contentStyle={{ flexGrow: 1, justifyContent: "center" }}>
				<EmptyState
					icon="info"
					title="This page doesn’t exist"
					body="The link may be old, or the screen has moved."
					action={
						<Button label="Go to Today" onPress={() => router.replace("/")} />
					}
				/>
			</Screen>
		</>
	);
}
