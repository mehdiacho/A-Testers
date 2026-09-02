# A-Testers for Android

Kotlin + Jetpack Compose. Two screens that matter: the catalogue of apps needing testers,
and *my testing* — where a tester checks in each day and the phone reports what it can
actually see about the app under test.

## Why there is a phone app at all

The reference platform accepts a screenshot as proof of install. A screenshot takes a
minute to fake and a developer has to review every one by hand.

Here the device that installed the app is the one making the claim. `InstallCheck` asks
PackageManager whether the package is present, what version, when it was first installed,
and which store installed it — `com.android.vending` means Play, anything else is a
sideload and a closed test cannot arrive that way. That evidence rides along with the
proof submission and with every daily check-in.

It is not proof against a determined attacker: a rooted phone can lie to PackageManager.
It moves faking a test from "crop a screenshot" to "modify the OS", and the server treats
it as corroboration, never as authority — see `parseVerifiedInstall` in
`functions/src/economy/install.ts`, which overrides the two fields a device must not get
to assert:

- `integrityVerdict` is always `UNEVALUATED` until a Play Integrity token is validated
  server-side (next phase).
- `checkedAt` comes from the server clock, so a wound-forward device cannot stretch a
  retention window.

## Build

```bash
cd android && ./gradlew :app:assembleDebug
```

Needs JDK 17+ and the Android SDK. `local.properties` points at the SDK and is
gitignored; use forward slashes in it — a Windows path with single backslashes is not a
valid `.properties` escape and fails with a bare "filename, directory name, or volume
label syntax is incorrect".

## Running against the emulators

Debug builds talk to the emulator suite (`BuildConfig.USE_EMULATORS`), so the app never
writes to the real project by accident. The host is `10.0.2.2`, which is how an Android
emulator reaches the machine it runs on. On a physical device, forward the ports instead:

```bash
adb reverse tcp:8080 tcp:8080 && adb reverse tcp:9099 tcp:9099 && adb reverse tcp:5001 tcp:5001
```

and change `EMULATOR_HOST` to `127.0.0.1` in `app/build.gradle.kts`.

Sign-in against the emulator uses the Auth emulator's unsigned-token path — no OAuth
client, no Play services account picker. The generated subject is kept in preferences so
relaunching is the same tester and reinstalling is a new one.

## Google sign-in against the real project

Not wired up yet, and it cannot be until two things happen in the Firebase console:

1. **Authentication is enabled** with Google as a provider.
2. **This build's SHA-1 is registered** on the Android app, and `google-services.json` is
   re-downloaded.

Until then `google-services.json` has an empty `oauth_client` array, so the
`default_web_client_id` string resource does not exist. `AuthRepository` resolves that
resource by name rather than referencing `R.string`, so a project without one fails with a
sentence explaining what to do instead of a missing-symbol build error.

Regenerate the config after either change:

```bash
firebase apps:sdkconfig ANDROID 1:681278678995:android:b1d307c334cf593008b126 --project a-testers-app --out android/app/google-services.json
```

## Installing on a physical device

This machine cannot `adb install` onto Mehdi's phone — HyperOS refuses every adb install
path with `INSTALL_FAILED_USER_RESTRICTED`. Serve the APK and tap install on the handset:

```bash
adb reverse tcp:8099 tcp:8099
```

then serve `app/build/outputs/apk/debug/` on port 8099 and open `http://localhost:8099/`
on the phone. Batch every pending build into one directory listing — each install costs a
trip to the handset.

## Not done yet

- Play Integrity attestation (the half of install verification that cannot be forged).
- Proof screenshot capture and upload — reserving, checking in and withdrawing work from
  the phone, but the screenshot still has to be submitted from the web app.
- Developer-side views. The retention board is web-only for now.
