import { expoClient } from "@better-auth/expo/client";
import * as SecureStore from "expo-secure-store";
import { createAuthClient } from "better-auth/react";

import { getServerUrl } from "./server-url";

export const authClient = createAuthClient({
	baseURL: getServerUrl(),
	plugins: [
		expoClient({
			scheme: "jooling",
			storagePrefix: "jooling",
			storage: SecureStore,
		}),
	],
});
