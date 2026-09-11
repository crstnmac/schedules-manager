import { env } from "@SchedulesManager/env/web";
import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient({
	baseURL: env.VITE_SERVER_URL,
	fetchOptions: { credentials: "include" },
});
