package tech.mehdiacho.atesters.data

import android.content.Context
import android.content.pm.PackageManager
import java.util.Date

/**
 * On-device install verification.
 *
 * This is the whole reason the platform has a phone app. The reference platform takes a
 * screenshot as proof, which anyone can fake in a minute and a developer has to review by
 * hand. Here the device that installed the app is the one making the claim: we ask the
 * package manager whether the package is actually present, when it was installed, and —
 * where the OS will say — which store installed it.
 *
 * What this is not: proof against a determined attacker. A rooted device can lie to
 * PackageManager. It raises the cost of faking a test from "crop a screenshot" to
 * "modify the OS", and the Play Integrity verdict (next phase) is what closes the rest of
 * the gap. Nothing here is trusted server-side on its own.
 */
data class InstallEvidence(
    val packageName: String,
    val installed: Boolean,
    val versionName: String?,
    val versionCode: Long?,
    val firstInstallAt: Date?,
    val lastUpdatedAt: Date?,
    /** The package that installed it — `com.android.vending` for Play. Null on older APIs or when hidden. */
    val installerPackage: String?,
) {
    /**
     * A closed test is delivered through Play, so an install that did not come from Play
     * is not evidence of a closed-test opt-in — it is a sideload. Reported, not enforced:
     * some OEM builds report a proxy installer, and the server makes the final call.
     */
    val fromPlayStore: Boolean get() = installerPackage == "com.android.vending"
}

object InstallCheck {

    fun evidenceFor(context: Context, packageName: String): InstallEvidence {
        val pm = context.packageManager
        val info = runCatching {
            @Suppress("DEPRECATION")
            pm.getPackageInfo(packageName, 0)
        }.getOrNull()

        if (info == null) {
            return InstallEvidence(packageName, false, null, null, null, null, null)
        }

        return InstallEvidence(
            packageName = packageName,
            installed = true,
            versionName = info.versionName,
            versionCode = if (android.os.Build.VERSION.SDK_INT >= 28) {
                info.longVersionCode
            } else {
                @Suppress("DEPRECATION")
                info.versionCode.toLong()
            },
            firstInstallAt = Date(info.firstInstallTime),
            lastUpdatedAt = Date(info.lastUpdateTime),
            installerPackage = installerOf(pm, packageName),
        )
    }

    /**
     * getInstallerPackageName was deprecated in API 30 in favour of getInstallSourceInfo,
     * which throws NameNotFoundException rather than returning null — and on some OEM
     * builds throws SecurityException instead. Both paths are wrapped.
     */
    private fun installerOf(pm: PackageManager, packageName: String): String? = runCatching {
        if (android.os.Build.VERSION.SDK_INT >= 30) {
            pm.getInstallSourceInfo(packageName).installingPackageName
        } else {
            @Suppress("DEPRECATION")
            pm.getInstallerPackageName(packageName)
        }
    }.getOrNull()
}
