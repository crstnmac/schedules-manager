import { Button } from "@SchedulesManager/ui/components/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardFooter,
	CardHeader,
	CardTitle,
} from "@SchedulesManager/ui/components/card";
import { Field, FieldLabel } from "@SchedulesManager/ui/components/field";
import { Spinner } from "@SchedulesManager/ui/components/spinner";
import { Textarea } from "@SchedulesManager/ui/components/textarea";
import { memo } from "react";

export const PreferencesCard = memo(function PreferencesCard({
	preference,
	onPreferenceChange,
	saving,
	onSave,
}: {
	preference: string;
	onPreferenceChange: (value: string) => void;
	saving: boolean;
	onSave: () => void;
}) {
	return (
		<Card>
			<CardHeader>
				<CardTitle>Preferences</CardTitle>
				<CardDescription>
					A note for your manager. Preferences never block scheduling.
				</CardDescription>
			</CardHeader>
			<CardContent>
				<Field>
					<FieldLabel htmlFor="preference">What you prefer</FieldLabel>
					<Textarea
						id="preference"
						value={preference}
						onChange={(event) => onPreferenceChange(event.target.value)}
						placeholder="I prefer mornings and Sundays."
					/>
				</Field>
			</CardContent>
			<CardFooter>
				<Button disabled={saving} onClick={() => onSave()}>
					{saving ? <Spinner data-icon="inline-start" /> : null}
					Save preference
				</Button>
			</CardFooter>
		</Card>
	);
});
