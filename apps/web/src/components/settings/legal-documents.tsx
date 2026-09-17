import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@SchedulesManager/ui/components/card";
import { ArrowUpRight } from "lucide-react";

import { legalUrls, TERMS_VERSION } from "@/lib/legal";

/**
 * Legal documents the signed-in user has accepted. Apple's App Store
 * guidelines require apps offering auto-renewable subscriptions to link the
 * terms of use and privacy policy in the app metadata and in a discoverable
 * place inside the app; this section is that place on the web.
 */
export function LegalDocumentsCard() {
	return (
		<Card>
			<CardHeader>
				<CardTitle>Legal documents</CardTitle>
				<CardDescription>
					The agreements that apply to your use of jooling. Terms version{" "}
					{TERMS_VERSION}.
				</CardDescription>
			</CardHeader>
			<CardContent className="flex flex-col gap-3 text-sm">
				<a
					className="inline-flex items-center gap-1 underline"
					href={legalUrls.terms}
					target="_blank"
					rel="noreferrer"
				>
					Terms &amp; Conditions <ArrowUpRight className="size-3.5" />
				</a>
				<a
					className="inline-flex items-center gap-1 underline"
					href={legalUrls.privacy}
					target="_blank"
					rel="noreferrer"
				>
					Privacy Policy <ArrowUpRight className="size-3.5" />
				</a>
				<a
					className="inline-flex items-center gap-1 underline"
					href={legalUrls.dpa}
					target="_blank"
					rel="noreferrer"
				>
					Data Processing Addendum <ArrowUpRight className="size-3.5" />
				</a>
			</CardContent>
		</Card>
	);
}
