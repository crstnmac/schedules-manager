// Learn more https://docs.expo.io/guides/customizing-metro
const { getDefaultConfig } = require("expo/metro-config");
const path = require("node:path");

const config = getDefaultConfig(__dirname);

// Bun's isolated store can cause Metro to resolve a second copy of react.
// Force a single copy from the app's node_modules.
const appNodeModules = path.resolve(__dirname, "node_modules");
config.resolver = config.resolver || {};
config.resolver.extraNodeModules = {
	...(config.resolver.extraNodeModules || {}),
	react: path.join(appNodeModules, "react"),
	"react-native": path.join(appNodeModules, "react-native"),
	"react-native-safe-area-context": path.join(appNodeModules, "react-native-safe-area-context"),
	"@tanstack/react-query": path.join(appNodeModules, "@tanstack/react-query"),
};
config.resolver.nodeModulesPaths = [appNodeModules, path.resolve(__dirname, "../../node_modules")];
config.watchFolders = [...(config.watchFolders || []), path.resolve(__dirname, "../..")];

// Dedupe React: extraNodeModules forces single copy from app's node_modules.
// (Blocking node_modules/.bun via blockList broke react/jsx-runtime resolution
//  for expo-router's qualified-entry, so we rely on extraNodeModules alone.)

module.exports = config;
