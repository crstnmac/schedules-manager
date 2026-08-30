import { Spinner } from "@SchedulesManager/ui/components/spinner";

export default function Loader() {
	return (
		<div className="grid h-full place-items-center pt-8">
			<Spinner />
			<span className="sr-only">Loading</span>
		</div>
	);
}
