const { withAppDelegate, withInfoPlist } = require("expo/config-plugins");

/**
 * UIKit raises a fatal runtime issue ("no scene lifecycle adoption") for apps
 * built with the iOS 26+ SDK that still create their UIWindow in
 * didFinishLaunchingWithOptions. Expo's AppDelegate template does exactly that
 * (scene support is still a TODO upstream), so this plugin:
 *
 *  1. declares UIApplicationSceneManifest with a single scene, and
 *  2. converts the generated AppDelegate to scene lifecycle: the React Native
 *     factory moves to static storage, `configurationForConnectingSceneSession`
 *     returns a configuration with our SceneDelegate, and the SceneDelegate
 *     hosts the RN window.
 *
 * Idempotent: if the AppDelegate already contains the SceneDelegate, it is
 * returned unchanged.
 */

const SCENE_CONFIGURATION_METHOD = `  // UIKit requires scene lifecycle adoption for apps built with the iOS 26+ SDK.
  public func application(
    _ application: UIApplication,
    configurationForConnecting sceneSession: UISceneSession,
    options: UIScene.ConnectionOptions
  ) -> UISceneConfiguration {
    let configuration = UISceneConfiguration(name: nil, sessionRole: sceneSession.role)
    configuration.delegateClass = SceneDelegate.self
    return configuration
  }
`;

const SCENE_DELEGATE_CLASS = `class SceneDelegate: UIResponder, UIWindowSceneDelegate {
  var window: UIWindow?

  func scene(
    _ scene: UIScene,
    willConnectTo session: UISceneSession,
    options connectionOptions: UIScene.ConnectionOptions
  ) {
    guard let windowScene = scene as? UIWindowScene else { return }
    let window = UIWindow(windowScene: windowScene)
    self.window = window
    AppDelegate.reactNativeFactory?.startReactNative(
      withModuleName: "main",
      in: window)
    window.makeKeyAndVisible()
  }
}
`;

function patchAppDelegate(contents) {
	if (contents.includes("class SceneDelegate")) {
		return contents;
	}

	let next = contents;

	// The factory must outlive didFinishLaunching so the scene delegate can use it.
	next = next.replace(
		/(\n) {2}var reactNativeDelegate: ExpoReactNativeFactoryDelegate\?/,
		"$1  static var reactNativeDelegate: ExpoReactNativeFactoryDelegate?",
	);
	next = next.replace(
		/(\n) {2}var reactNativeFactory: RCTReactNativeFactory\?/,
		"$1  static var reactNativeFactory: RCTReactNativeFactory?",
	);
	next = next.replace(
		/\n {4}reactNativeDelegate = delegate/,
		"\n    Self.reactNativeDelegate = delegate",
	);
	next = next.replace(
		/\n {4}reactNativeFactory = factory/,
		"\n    Self.reactNativeFactory = factory",
	);

	// Remove the legacy window + RN startup; the scene delegate owns the window now.
	const legacyStartup =
		/#if os\(iOS\) \|\| os\(tvOS\)\n\s*window = UIWindow\(frame: UIScreen\.main\.bounds\)\n\s*factory\.startReactNative\(\n?\s*withModuleName: "main",\n?\s*in: window,?\n?\s*launchOptions: launchOptions\)\n\s*#endif\n/;
	if (!legacyStartup.test(next)) {
		console.warn(
			"[with-scene-lifecycle] AppDelegate startup block not found; scene patch skipped",
		);
		return next;
	}
	next = next.replace(legacyStartup, "");

	// Register the scene configuration before the Linking API section.
	if (!next.includes("// Linking API")) {
		console.warn(
			"[with-scene-lifecycle] '// Linking API' marker not found; scene patch skipped",
		);
		return next;
	}
	next = next.replace(
		"  // Linking API",
		`${SCENE_CONFIGURATION_METHOD}\n  // Linking API`,
	);

	// Add the scene delegate before the ReactNativeDelegate class.
	next = next.replace(
		"class ReactNativeDelegate:",
		`${SCENE_DELEGATE_CLASS}\nclass ReactNativeDelegate:`,
	);

	return next;
}

module.exports = function withSceneLifecycle(config) {
	const withManifest = withInfoPlist(config, (nextConfig) => {
		nextConfig.modResults.UIApplicationSceneManifest = {
			UIApplicationSupportsMultipleScenes: false,
		};
		return nextConfig;
	});

	return withAppDelegate(withManifest, (nextConfig) => {
		nextConfig.modResults.contents = patchAppDelegate(
			nextConfig.modResults.contents,
		);
		return nextConfig;
	});
};
