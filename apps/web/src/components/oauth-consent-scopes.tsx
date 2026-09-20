import { Checkbox } from "@SchedulesManager/ui/components/checkbox";
import { Label } from "@SchedulesManager/ui/components/label";

export const REQUIRED_OAUTH_SCOPES = new Set(["openid", "profile", "email"]);

export const OAUTH_SCOPE_LABELS: Record<string, string> = {
	openid: "Confirm who you are",
	profile: "See your basic profile",
	email: "See your email address",
	offline_access: "Stay connected without asking again",
	"schedule.read": "View published schedules and drafts",
	"schedule.write": "Create and change draft schedules, and publish them",
	"workers.read": "View workers, availability, and wage rates",
	"workers.write": "Invite workers and assign their workplace access",
	"reports.read": "View labor hours and cost reports",
	"requests.read": "View time-off requests",
	"requests.write": "Submit and update time-off requests",
};

export function OAuthConsentScopes({
	requestedScopes,
	selectedScopes,
	onToggle,
}: {
	requestedScopes: string[];
	selectedScopes: string[];
	onToggle: (scope: string, selected: boolean) => void;
}) {
	return requestedScopes.map((scope) => {
		const required = REQUIRED_OAUTH_SCOPES.has(scope);
		return (
			<div key={scope} className="flex items-start gap-3">
				<Checkbox
					id={`scope-${scope}`}
					checked={selectedScopes.includes(scope)}
					disabled={required}
					onCheckedChange={(checked) => onToggle(scope, checked === true)}
				/>
				<div className="grid gap-0.5">
					<Label
						htmlFor={`scope-${scope}`}
						className="font-normal leading-snug"
					>
						{OAUTH_SCOPE_LABELS[scope] ?? scope}
					</Label>
					{required ? (
						<span className="text-muted-foreground text-xs">
							Required for sign-in
						</span>
					) : null}
				</div>
			</div>
		);
	});
}
