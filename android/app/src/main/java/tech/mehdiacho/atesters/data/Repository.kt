package tech.mehdiacho.atesters.data

import com.google.firebase.firestore.DocumentSnapshot
import com.google.firebase.firestore.Query
import com.google.firebase.functions.FirebaseFunctionsException
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.callbackFlow
import kotlinx.coroutines.tasks.await

/**
 * Everything the app reads or writes.
 *
 * Reads go straight to Firestore under the security rules; every write goes through a
 * callable, because every write in this system moves a seat and only the functions can do
 * that atomically. There is deliberately no client-side write path.
 */
object Repository {

    private val db get() = FirebaseServices.db
    private val functions get() = FirebaseServices.functions

    // -----------------------------------------------------------------------
    // reads
    // -----------------------------------------------------------------------

    fun openApps(category: String? = null): Flow<List<AppListing>> {
        var q: Query = db.collection("apps").whereEqualTo("status", "open")
        if (category != null) q = q.whereEqualTo("category", category)
        return q.orderBy("createdAt", Query.Direction.DESCENDING)
            .limit(50)
            .snapshots { docs -> docs.map(AppListing::from) }
    }

    fun app(appId: String): Flow<AppListing?> =
        db.collection("apps").document(appId).snapshots { if (it.exists()) AppListing.from(it) else null }

    fun profile(uid: String): Flow<UserProfile?> =
        db.collection("users").document(uid).snapshots { if (it.exists()) UserProfile.from(it) else null }

    fun platformConfig(): Flow<PlatformConfig> =
        db.collection("config").document("platform").snapshots { PlatformConfig.from(it) }

    /**
     * The tester's own reservations. `testerUid` is in the query because security rules
     * are not filters — a list is only allowed when the query itself proves every match
     * is readable by the caller.
     */
    fun myReservations(uid: String): Flow<List<Reservation>> =
        db.collection("reservations")
            .whereEqualTo("testerUid", uid)
            .orderBy("reservedAt", Query.Direction.DESCENDING)
            .limit(50)
            .snapshots { docs -> docs.map(Reservation::from) }

    // -----------------------------------------------------------------------
    // writes — all callables
    // -----------------------------------------------------------------------

    suspend fun reserveSlot(appId: String): Unit = call("reserveSlot", mapOf("appId" to appId))

    suspend fun withdrawReservation(appId: String): Unit =
        call("withdrawReservation", mapOf("appId" to appId))

    suspend fun submitProof(appId: String, proofUrl: String, note: String?, evidence: InstallEvidence?) {
        val payload = buildMap<String, Any> {
            put("appId", appId)
            put("proofUrl", proofUrl)
            if (!note.isNullOrBlank()) put("note", note)
            if (evidence != null) put("verifiedInstall", evidence.toPayload())
        }
        call("submitProof", payload)
    }

    /**
     * The daily retention ping. The server keys check-ins by UTC date, so calling twice in
     * one day is harmless — which is why the UI can call this on open without guarding.
     */
    suspend fun recordCheckin(appId: String, evidence: InstallEvidence?) {
        val payload = buildMap<String, Any> {
            put("appId", appId)
            if (evidence != null) put("verifiedInstall", evidence.toPayload())
        }
        call("recordCheckin", payload)
    }

    private suspend fun call(name: String, data: Map<String, Any>) {
        try {
            functions.getHttpsCallable(name).call(data).await()
        } catch (e: FirebaseFunctionsException) {
            throw CallableError(e.reason(), e)
        }
    }
}

/**
 * The callables reject with a machine-readable `reason` in the error details; the web app
 * shows the same strings. Carrying it through means the UI can explain *why* a reserve
 * failed rather than showing a stack trace.
 */
class CallableError(val reason: String, cause: Throwable) : Exception(reason, cause)

private fun FirebaseFunctionsException.reason(): String {
    val details = details as? Map<*, *>
    return (details?.get("reason") as? String) ?: message ?: code.name
}

private fun InstallEvidence.toPayload(): Map<String, Any?> = mapOf(
    "packageName" to packageName,
    "installed" to installed,
    "versionName" to versionName,
    "versionCode" to versionCode,
    "firstInstallAt" to firstInstallAt?.time,
    "lastUpdatedAt" to lastUpdatedAt?.time,
    "installerPackage" to installerPackage,
    "fromPlayStore" to fromPlayStore,
)

/** Snapshot listener as a Flow, with the mapping applied inside so callers see domain types. */
private fun <T> Query.snapshots(map: (List<DocumentSnapshot>) -> T): Flow<T> = callbackFlow {
    val registration = addSnapshotListener { snap, error ->
        when {
            error != null -> close(error)
            snap != null -> trySend(map(snap.documents))
        }
    }
    awaitClose { registration.remove() }
}

private fun <T> com.google.firebase.firestore.DocumentReference.snapshots(
    map: (DocumentSnapshot) -> T,
): Flow<T> = callbackFlow {
    val registration = addSnapshotListener { snap, error ->
        when {
            error != null -> close(error)
            snap != null -> trySend(map(snap))
        }
    }
    awaitClose { registration.remove() }
}
