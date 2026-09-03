import { Avatar, AvatarFallback } from "@SchedulesManager/ui/components/avatar";
import { Badge } from "@SchedulesManager/ui/components/badge";
import {
	Item,
	ItemContent,
	ItemDescription,
	ItemMedia,
	ItemTitle,
} from "@SchedulesManager/ui/components/item";

import type { MeProfile } from "@/lib/queries";
import { useDisplayPrefs } from "@/lib/use-display-prefs";

type ProfileIdentity = Pick<MeProfile, "id" | "email" | "fullName">;

export function profileInitials(profile: ProfileIdentity) {
	const name = profile.fullName?.trim();
	if (name) {
		const parts = name.split(/\s+/);
		const first = parts[0]?.[0] ?? "";
		const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "";
		return (
			`${first}${last}`.toUpperCase() || profile.email.slice(0, 2).toUpperCase()
		);
	}
	return profile.email.slice(0, 2).toUpperCase();
}

export function CurrentProfile({
	profile,
	kind,
}: {
	profile: ProfileIdentity;
	kind?: "manager" | "worker" | null;
}) {
	const { formatPerson } = useDisplayPrefs();
	const displayName = formatPerson(profile.fullName, profile.email);

	return (
		<Item variant="outline" size="sm">
			<ItemMedia>
				<Avatar size="sm">
					<AvatarFallback>{profileInitials(profile)}</AvatarFallback>
				</Avatar>
			</ItemMedia>
			<ItemContent>
				<ItemTitle>
					{displayName}
					{kind ? (
						<Badge variant="outline" className="uppercase">
							{kind}
						</Badge>
					) : null}
				</ItemTitle>
				{profile.fullName ? (
					<ItemDescription>{profile.email}</ItemDescription>
				) : (
					<ItemDescription>Signed in</ItemDescription>
				)}
			</ItemContent>
		</Item>
	);
}
