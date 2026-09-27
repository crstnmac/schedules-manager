# Android release tags

Pushing a tag named `vMAJOR.MINOR.PATCH` on a commit in `main` runs
[`play-store-release.yml`](../.github/workflows/play-store-release.yml). The tag must
match `expo.version` in [`apps/native/app.json`](../apps/native/app.json). The job
checks native types, builds an Android App Bundle on EAS, and submits that exact
build to Google Play's **production** track. EAS increments Android `versionCode`
remotely for each production build.

## One-time setup

1. Create the app in Google Play Console with package name
   `com.jooling.schedulesmanager`. Complete the production listing and required
   declarations before publishing a production release.
2. Configure Android signing on EAS with an initial interactive production build
   from `apps/native`: `eas build --platform android --profile production`. If
   Play already has a build, initialize EAS's remote Android version code to its
   latest value before enabling tag releases.
3. Create a Google Play service account with permission to release this app to
   production. Upload its JSON key to the **Android service credentials** for the
   `production` profile in the [EAS project dashboard](https://expo.dev/accounts/crstnmac/projects/jooling/credentials)
   or with `eas credentials --platform android`. Keep the JSON key out of Git.
4. The EAS **production** environment variable `EXPO_PUBLIC_SERVER_URL` is set
   to `https://api.jooling.com/`. `EXPO_PUBLIC_APP_URL` defaults to
   `https://app.jooling.com`; set it in the same environment if production uses
   another URL. These values are embedded in the app bundle.
5. Create an [Expo access token](https://docs.expo.dev/accounts/programmatic-access/)
   for an account with access to the EAS project. Add it as the repository Actions
   secret `EXPO_TOKEN` (GitHub → Settings → Secrets and variables → Actions).
   The workflow never stores the token or Play service account key in Git.

## Release

Update `expo.version` in `apps/native/app.json`, merge the change into `main`,
and push the matching tag:

```bash
git switch main
git pull --ff-only
git tag v1.0.0
git push origin v1.0.0
```

Use the version currently in `app.json` instead of `v1.0.0` for later releases.
Watch the **Release Android to Google Play** GitHub Actions run and the EAS
submission. A successful submission uploads the release to Play Console; Google
review and publication timing are controlled by Google Play.
