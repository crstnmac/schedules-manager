import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@SchedulesManager/ui/components/card";
import {
	ToggleGroup,
	ToggleGroupItem,
} from "@SchedulesManager/ui/components/toggle-group";
import { memo, useState } from "react";
import { LeaveForecastTable } from "@/components/leave-forecast-table";
import { useLeaveForecast } from "@/lib/queries";

export const ForecastCard = memo(function ForecastCard({
	workplaceId,
	employmentId,
}: {
	workplaceId: string | undefined;
	employmentId: string | undefined;
}) {
	const [forecastMonths, setForecastMonths] = useState(6);
	const forecast = useLeaveForecast(workplaceId, employmentId, forecastMonths);

	return (
		<Card>
			<CardHeader className="flex flex-row items-start justify-between gap-3">
				<div className="grid gap-1.5">
					<CardTitle>Leave forecast</CardTitle>
					<CardDescription>
						Projected accrual and approved usage for your leave types.
					</CardDescription>
				</div>
				<ToggleGroup
					aria-label="Forecast horizon"
					value={[String(forecastMonths)]}
					variant="outline"
					size="sm"
					spacing={0}
					onValueChange={(value) => {
						const next = value[0];
						if (next === "6" || next === "12") {
							setForecastMonths(Number(next));
						}
					}}
				>
					<ToggleGroupItem value="6">6 months</ToggleGroupItem>
					<ToggleGroupItem value="12">12 months</ToggleGroupItem>
				</ToggleGroup>
			</CardHeader>
			<CardContent>
				<LeaveForecastTable
					forecast={forecast.data}
					isLoading={forecast.isLoading}
				/>
			</CardContent>
		</Card>
	);
});
