/** Refresh public, low-rating Google Play reviews. Run with `bun scripts/gplay-reviews.ts`. */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import gplay from "google-play-scraper";

const apps = [
	["When I Work", "com.thisclicks.wiw"],
	["Homebase", "com.joinhomebase.homebase.homebase"],
	["7shifts", "com.sevenshifts.android"],
	["Deputy", "com.deputy.android"],
	["Sling", "com.gangverk.sling"],
	["Connecteam", "com.connecteamco.Connecteam.app"],
	["HotSchedules", "com.tdr3.hs.android"],
	["Planday", "com.planday.ninetofiveapp"],
	["Zoho Shifts", "com.zoho.shifts"],
] as const;

export function managerSignal(text: string) {
	return /\b(my (staff|employees|team|restaurant|business|store|locations?)|i (manage|own|run|schedule)|our (staff|employees|business|restaurant))\b/i.test(
		text,
	);
}

export function csvCell(value: unknown) {
	const safe = String(value ?? "").replace(
		/^[=+@\t-]/,
		(prefix) => `\t${prefix}`,
	);
	return `"${safe.replaceAll('"', '""').replaceAll(/\r?\n/g, " ")}"`;
}

type Review = {
	id: string;
	app: string;
	appId: string;
	userName: string;
	date: string;
	score: number;
	thumbsUp: number;
	text: string;
	url: string;
	managerSignal: boolean;
	status: "new" | "reviewed" | "archived";
};

async function main() {
	const output = join(import.meta.dir, "..", "output");
	await mkdir(output, { recursive: true });
	const path = join(output, "gplay-review-pipeline.json");
	let previous: Review[] = [];
	try {
		previous = JSON.parse(await readFile(path, "utf8")) as Review[];
	} catch (error) {
		if (!(error instanceof Error && "code" in error && error.code === "ENOENT"))
			throw error;
	}
	const byId = new Map(
		previous.map((review) => [`${review.appId}:${review.id}`, review]),
	);
	const errors: string[] = [];
	let newCount = 0;
	for (const [app, appId] of apps) {
		try {
			const result = await gplay.reviews({
				appId,
				sort: gplay.sort.NEWEST,
				num: 150,
				paginate: true,
				country: "us",
				lang: "en",
				throttle: 2,
			});
			for (const item of result.data) {
				if (item.score > 2) continue;
				const key = `${appId}:${item.id}`;
				const prior = byId.get(key);
				if (!prior) newCount += 1;
				byId.set(key, {
					id: item.id,
					app,
					appId,
					userName: item.userName,
					date: new Date(item.date).toISOString(),
					score: item.score,
					thumbsUp: item.thumbsUp ?? 0,
					text: item.text,
					url:
						item.url ||
						`https://play.google.com/store/apps/details?id=${appId}`,
					managerSignal: managerSignal(item.text),
					status: prior?.status ?? "new",
				});
			}
		} catch (error) {
			errors.push(
				`${app}: ${error instanceof Error ? error.message : String(error)}`,
			);
		}
		await Bun.sleep(1000);
	}
	if (errors.length === apps.length)
		throw new Error(`Every app failed: ${errors.join("; ")}`);
	const reviews = [...byId.values()].sort((a, b) =>
		b.date.localeCompare(a.date),
	);
	await writeFile(path, `${JSON.stringify(reviews, null, 2)}\n`);
	const columns = [
		"id",
		"app",
		"reviewer_display_name",
		"date",
		"score",
		"thumbs_up",
		"manager_signal",
		"status",
		"review_url",
		"text",
	];
	await writeFile(
		join(output, "gplay-review-pipeline.csv"),
		`${[
			columns.join(","),
			...reviews.map((review) =>
				[
					review.id,
					review.app,
					review.userName,
					review.date,
					review.score,
					review.thumbsUp,
					review.managerSignal,
					review.status,
					review.url,
					review.text,
				]
					.map(csvCell)
					.join(","),
			),
		].join("\n")}\n`,
	);
	console.log(JSON.stringify({ total: reviews.length, newCount, errors }));
}

if (import.meta.main) await main();
