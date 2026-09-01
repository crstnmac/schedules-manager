const { withProjectBuildGradle, withAppBuildGradle, withDangerousMod } = require("expo/config-plugins");
const fs = require("node:fs");
const path = require("node:path");

const GOOGLE_SERVICES_VERSION = "4.4.2";

function copyGoogleServicesFile(config) {
	return withDangerousMod(config, [
		"android",
		(config) => {
			const source = path.join(
				config.modRequest.projectRoot,
				"google-services.json",
			);
			const destination = path.join(
				config.modRequest.platformProjectRoot,
				"app",
				"google-services.json",
			);
			if (fs.existsSync(source)) {
				fs.copyFileSync(source, destination);
			} else {
				console.warn(
					"[with-firebase] google-services.json not found at project root; Android push will not work",
				);
			}
			return config;
		},
	]);
}

function addGoogleServicesClasspath(config) {
	return withProjectBuildGradle(config, (config) => {
		if (
			config.modResults.language === "groovy" &&
			!config.modResults.contents.includes("com.google.gms:google-services")
		) {
			config.modResults.contents = config.modResults.contents.replace(
				/dependencies\s*{/,
				`dependencies {
        classpath('com.google.gms:google-services:${GOOGLE_SERVICES_VERSION}')`,
			);
		}
		return config;
	});
}

function applyGoogleServicesPlugin(config) {
	return withAppBuildGradle(config, (config) => {
		if (
			config.modResults.language === "groovy" &&
			!config.modResults.contents.includes(
				"com.google.gms.google-services",
			)
		) {
			config.modResults.contents = `apply plugin: "com.google.gms.google-services"\n${config.modResults.contents}`;
		}
		return config;
	});
}

module.exports = function withFirebaseGoogleServices(config) {
	config = addGoogleServicesClasspath(config);
	config = applyGoogleServicesPlugin(config);
	config = copyGoogleServicesFile(config);
	return config;
};
