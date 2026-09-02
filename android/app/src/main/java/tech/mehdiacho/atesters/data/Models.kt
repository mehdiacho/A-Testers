package tech.mehdiacho.atesters.data

import com.google.firebase.Timestamp
import com.google.firebase.firestore.DocumentSnapshot
import java.util.Date

/**
 * Mirrors of the shared TypeScript types in packages/shared/src/types.ts.
 *
 * Mapped by hand rather than with toObject(): the documents are read-only here, only a
 * few fields matter to the phone, and hand mapping means a field the backend adds later
 * cannot crash an installed app that predates it.
 */

data class UserProfile(
    val uid: String,
    val displayName: String?,
    val seatBalance: Int,
    val seatsHeld: Int,
    val reputation: Int,
    val testsCompleted: Int,
) {
    companion object {
        fun from(snap: DocumentSnapshot): UserProfile = UserProfile(
            uid = snap.id,
            displayName = snap.getString("displayName"),
            seatBalance = snap.int("seatBalance"),
            seatsHeld = snap.int("seatsHeld"),
            reputation = snap.int("reputation"),
            testsCompleted = snap.int("testsCompleted"),
        )
    }
}

data class AppListing(
    val id: String,
    val ownerUid: String,
    val name: String,
    val packageName: String,
    val shortDescription: String,
    val description: String,
    val category: String,
    val playTestUrl: String,
    val googleGroupUrl: String?,
    val iconUrl: String?,
    val status: String,
    val seatsRequested: Int,
    val seatsReserved: Int,
    val seatsFilled: Int,
) {
    val openSlots: Int get() = (seatsRequested - seatsFilled - seatsReserved).coerceAtLeast(0)

    companion object {
        fun from(snap: DocumentSnapshot): AppListing = AppListing(
            id = snap.id,
            ownerUid = snap.getString("ownerUid").orEmpty(),
            name = snap.getString("name").orEmpty(),
            packageName = snap.getString("packageName").orEmpty(),
            shortDescription = snap.getString("shortDescription").orEmpty(),
            description = snap.getString("description").orEmpty(),
            category = snap.getString("category").orEmpty(),
            playTestUrl = snap.getString("playTestUrl").orEmpty(),
            googleGroupUrl = snap.getString("googleGroupUrl"),
            iconUrl = snap.getString("iconUrl"),
            status = snap.getString("status").orEmpty(),
            seatsRequested = snap.int("seatsRequested"),
            seatsReserved = snap.int("seatsReserved"),
            seatsFilled = snap.int("seatsFilled"),
        )
    }
}

data class Reservation(
    val id: String,
    val appId: String,
    val ownerUid: String,
    val testerUid: String,
    val status: String,
    val expiresAt: Date?,
    val checkins: Map<String, Boolean>,
    val lastCheckinAt: Date?,
    val checkinStreak: Int,
    val rejectionReason: String?,
) {
    val isActive: Boolean get() = status == "reserved" || status == "proof_submitted"
    val daysCheckedIn: Int get() = checkins.count { it.value }

    companion object {
        fun from(snap: DocumentSnapshot): Reservation {
            // Firestore hands maps back untyped, and a check-in map written by an older
            // client could hold anything — filter to the booleans rather than cast.
            val checkins = (snap.get("checkins") as? Map<*, *>).orEmpty()
                .mapNotNull { (k, v) -> if (k is String && v is Boolean) k to v else null }
                .toMap()

            return Reservation(
                id = snap.id,
                appId = snap.getString("appId").orEmpty(),
                ownerUid = snap.getString("ownerUid").orEmpty(),
                testerUid = snap.getString("testerUid").orEmpty(),
                status = snap.getString("status").orEmpty(),
                expiresAt = snap.date("expiresAt"),
                checkins = checkins,
                lastCheckinAt = snap.date("lastCheckinAt"),
                checkinStreak = snap.int("checkinStreak"),
                rejectionReason = snap.getString("rejectionReason"),
            )
        }
    }
}

/** Only the fields the phone actually reads; the rest of `config/platform` stays server-side. */
data class PlatformConfig(
    val requiredTesters: Int = 12,
    val requiredDays: Int = 14,
    val reservationTtlHours: Int = 72,
) {
    companion object {
        fun from(snap: DocumentSnapshot?): PlatformConfig {
            val default = PlatformConfig()
            if (snap == null || !snap.exists()) return default
            return PlatformConfig(
                requiredTesters = snap.intOrNull("requiredTesters") ?: default.requiredTesters,
                requiredDays = snap.intOrNull("requiredDays") ?: default.requiredDays,
                reservationTtlHours = snap.intOrNull("reservationTtlHours") ?: default.reservationTtlHours,
            )
        }
    }
}

private fun DocumentSnapshot.int(field: String): Int = intOrNull(field) ?: 0

private fun DocumentSnapshot.intOrNull(field: String): Int? = (get(field) as? Number)?.toInt()

private fun DocumentSnapshot.date(field: String): Date? = when (val v = get(field)) {
    is Timestamp -> v.toDate()
    is Date -> v
    else -> null
}
