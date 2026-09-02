import { Image, type ImageStyle, type StyleProp } from "react-native";

const logo = require("@/assets/images/logo-mark.png");

export function LogoMark({
	size = 48,
	style,
}: {
	size?: number;
	style?: StyleProp<ImageStyle>;
}) {
	return (
		<Image
			source={logo}
			style={[{ width: size, height: size }, style]}
			accessibilityRole="image"
			accessibilityLabel="jooling"
		/>
	);
}
