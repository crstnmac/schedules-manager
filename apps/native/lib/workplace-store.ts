import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCallback, useEffect, useState } from "react";

const KEY = "schedulesmanager.selectedWorkplaceId";

export function useSelectedWorkplaceId() {
	const [value, setValue] = useState<string | null>(null);
	const [ready, setReady] = useState(false);

	useEffect(() => {
		AsyncStorage.getItem(KEY)
			.then((stored) => setValue(stored))
			.finally(() => setReady(true));
	}, []);

	const select = useCallback((id: string | null) => {
		setValue(id);
		if (id === null) {
			void AsyncStorage.removeItem(KEY);
		} else {
			void AsyncStorage.setItem(KEY, id);
		}
	}, []);

	return { selected: value, ready, select };
}
