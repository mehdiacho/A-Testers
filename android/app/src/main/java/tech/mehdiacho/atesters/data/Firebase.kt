package tech.mehdiacho.atesters.data

import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.auth.ktx.auth
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.firestore.ktx.firestore
import com.google.firebase.functions.FirebaseFunctions
import com.google.firebase.functions.ktx.functions
import com.google.firebase.ktx.Firebase
import tech.mehdiacho.atesters.BuildConfig

/**
 * Single point of contact with Firebase.
 *
 * The callables live in europe-west1 (see functions/src/lib/options.ts) — asking for the
 * default region instead is a 404 at call time rather than a build error, so the region
 * is named in exactly one place.
 */
object FirebaseServices {
    const val REGION = "europe-west1"

    val auth: FirebaseAuth by lazy { Firebase.auth }
    val db: FirebaseFirestore by lazy { Firebase.firestore }
    val functions: FirebaseFunctions by lazy { Firebase.functions(REGION) }

    /**
     * Called once from Application.onCreate, before anything touches the SDKs —
     * useEmulator throws if the client has already opened a connection.
     */
    fun connectEmulatorsIfConfigured() {
        if (!BuildConfig.USE_EMULATORS) return
        val host = BuildConfig.EMULATOR_HOST
        auth.useEmulator(host, 9099)
        db.useEmulator(host, 8080)
        functions.useEmulator(host, 5001)
    }
}
