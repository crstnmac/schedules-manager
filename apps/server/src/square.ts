import { env } from "@SchedulesManager/env/server";
import {
	createCipheriv,
	createDecipheriv,
	createHash,
	randomBytes,
} from "node:crypto";
import { BadRequestError } from "./errors";

function squareBaseUrl() {
	return env.SQUARE_MODE === "sandbox"
		? "https://connect.squareupsandbox.com"
		: "https://connect.squareup.com";
}

export function squareConfig() {
	if (
		!env.SQUARE_APP_ID ||
		!env.SQUARE_APP_SECRET ||
		!env.SQUARE_TOKEN_ENCRYPTION_KEY
	) {
		throw new BadRequestError("Square integration is not configured");
	}
	const key = Buffer.from(env.SQUARE_TOKEN_ENCRYPTION_KEY, "base64");
	if (key.length !== 32) {
		throw new Error("SQUARE_TOKEN_ENCRYPTION_KEY must decode to 32 bytes");
	}
	return {
		appId: env.SQUARE_APP_ID,
		appSecret: env.SQUARE_APP_SECRET,
		key,
		baseUrl: squareBaseUrl(),
	};
}

export function encryptSquareToken(token: string, key: Buffer) {
	const iv = randomBytes(12);
	const cipher = createCipheriv("aes-256-gcm", key, iv);
	const ciphertext = Buffer.concat([
		cipher.update(token, "utf8"),
		cipher.final(),
	]);
	return [iv, cipher.getAuthTag(), ciphertext]
		.map((value) => value.toString("base64url"))
		.join(".");
}

export function decryptSquareToken(encrypted: string, key: Buffer) {
	const [iv, tag, ciphertext] = encrypted.split(".");
	if (!iv || !tag || !ciphertext)
		throw new Error("Invalid Square token ciphertext");
	const decipher = createDecipheriv(
		"aes-256-gcm",
		key,
		Buffer.from(iv, "base64url"),
	);
	decipher.setAuthTag(Buffer.from(tag, "base64url"));
	return Buffer.concat([
		decipher.update(Buffer.from(ciphertext, "base64url")),
		decipher.final(),
	]).toString("utf8");
}

export function squareStateHash(state: string) {
	return createHash("sha256").update(state).digest("hex");
}

export function squareRedirectUrl() {
	return `${env.BETTER_AUTH_URL.replace(/\/$/, "")}/v1/integrations/square/callback`;
}

type SquareTokenResponse = {
	access_token?: string;
	refresh_token?: string;
	expires_at?: string;
	merchant_id?: string;
	errors?: Array<{ detail?: string }>;
};

export async function exchangeSquareToken(
	input: { grantType: "authorization_code" | "refresh_token"; value: string },
	request: typeof fetch = fetch,
) {
	const config = squareConfig();
	const response = await request(`${config.baseUrl}/oauth2/token`, {
		method: "POST",
		headers: {
			"content-type": "application/json",
			"square-version": "2026-09-16",
		},
		body: JSON.stringify({
			client_id: config.appId,
			client_secret: config.appSecret,
			grant_type: input.grantType,
			...(input.grantType === "authorization_code"
				? { code: input.value, redirect_uri: squareRedirectUrl() }
				: { refresh_token: input.value }),
		}),
	});
	const body = (await response.json()) as SquareTokenResponse;
	if (
		!response.ok ||
		!body.access_token ||
		!body.refresh_token ||
		!body.expires_at ||
		!body.merchant_id
	) {
		throw new BadRequestError(
			body.errors?.[0]?.detail ?? "Square authorization failed",
		);
	}
	return {
		merchantId: body.merchant_id,
		accessToken: body.access_token,
		refreshToken: body.refresh_token,
		expiresAt: new Date(body.expires_at),
	};
}

export type SquareSale = { date: string; amountCents: number };

function cents(value: unknown): number {
	if (typeof value !== "string" || !/^-?\d+(?:\.\d{1,2})?$/.test(value)) {
		throw new BadRequestError("Square returned an invalid net sales amount");
	}
	const [whole, fraction = ""] = value.replace("-", "").split(".");
	const sign = value.startsWith("-") ? -1 : 1;
	const amount = sign * (Number(whole) * 100 + Number(fraction.padEnd(2, "0")));
	if (!Number.isSafeInteger(amount))
		throw new BadRequestError("Square sales amount is too large");
	return amount;
}

/** Square's closed-check net sales by the location's own business date. */
export async function fetchSquareDailySales(
	input: { token: string; squareLocationId: string; from: string; to: string },
	request: typeof fetch = fetch,
): Promise<SquareSale[]> {
	const baseUrl = squareBaseUrl();
	const query = {
		measures: ["Orders.net_sales"],
		dimensions: ["Orders.local_date"],
		filters: [
			{
				member: "Orders.local_date",
				operator: "inDateRange",
				values: [input.from, input.to],
			},
			{
				member: "Orders.location_id",
				operator: "equals",
				values: [input.squareLocationId],
			},
		],
		segments: ["Orders.closed_checks"],
		limit: 1000,
	};
	for (let attempt = 0; attempt < 5; attempt += 1) {
		const response = await request(`${baseUrl}/reporting/v1/load`, {
			method: "POST",
			headers: {
				authorization: `Bearer ${input.token}`,
				"content-type": "application/json",
			},
			body: JSON.stringify({ query }),
		});
		if (!response.ok)
			throw new BadRequestError(
				`Square sales query failed (${response.status})`,
			);
		const payload = (await response.json()) as {
			error?: string;
			data?: Record<string, unknown>[];
		};
		if (payload.error === "Continue wait") {
			if (attempt < 4)
				await new Promise((resolve) => setTimeout(resolve, 250 * 2 ** attempt));
			continue;
		}
		if (payload.error || !Array.isArray(payload.data)) {
			throw new BadRequestError("Square returned an invalid sales report");
		}
		return payload.data.map((row) => {
			const date = row["Orders.local_date"];
			if (
				typeof date !== "string" ||
				!/^\d{4}-\d{2}-\d{2}$/.test(date) ||
				date < input.from ||
				date > input.to
			) {
				throw new BadRequestError("Square returned an out-of-range sales date");
			}
			return { date, amountCents: cents(row["Orders.net_sales"]) };
		});
	}
	throw new BadRequestError(
		"Square sales report is still processing; retry shortly",
	);
}

export async function fetchSquareLocations(
	token: string,
	request: typeof fetch = fetch,
) {
	const response = await request(`${squareBaseUrl()}/v2/locations`, {
		headers: {
			authorization: `Bearer ${token}`,
			"square-version": "2026-09-16",
		},
	});
	if (!response.ok)
		throw new BadRequestError(
			`Square locations request failed (${response.status})`,
		);
	const payload = (await response.json()) as {
		locations?: Array<{ id?: string; name?: string }>;
	};
	if (!Array.isArray(payload.locations))
		throw new BadRequestError("Square returned invalid locations");
	return payload.locations.filter(
		(location): location is { id: string; name: string } =>
			typeof location.id === "string" && typeof location.name === "string",
	);
}

export async function revokeSquareToken(
	token: string,
	request: typeof fetch = fetch,
) {
	const config = squareConfig();
	const response = await request(`${config.baseUrl}/oauth2/revoke`, {
		method: "POST",
		headers: {
			authorization: `Client ${config.appSecret}`,
			"content-type": "application/json",
			"square-version": "2026-09-16",
		},
		body: JSON.stringify({ client_id: config.appId, access_token: token }),
	});
	const payload = (await response.json()) as { success?: boolean };
	if (!response.ok || payload.success !== true) {
		throw new BadRequestError(
			"Couldn’t revoke Square access; try disconnecting again",
		);
	}
}
