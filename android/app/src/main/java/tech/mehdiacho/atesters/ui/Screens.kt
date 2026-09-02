package tech.mehdiacho.atesters.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import tech.mehdiacho.atesters.data.AppListing
import tech.mehdiacho.atesters.data.InstallEvidence
import tech.mehdiacho.atesters.data.PlatformConfig
import tech.mehdiacho.atesters.data.Reservation
import java.util.concurrent.TimeUnit

// ---------------------------------------------------------------------------
// Sign in
// ---------------------------------------------------------------------------

@Composable
fun SignInScreen(busy: Boolean, onSignIn: () -> Unit) {
    Column(
        modifier = Modifier.fillMaxSize().padding(32.dp),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text("A-Testers", style = MaterialTheme.typography.headlineSmall)
        Spacer(Modifier.height(8.dp))
        Text(
            "Test other people's apps to earn seats, then spend those seats on testers for " +
                "your own. Twelve testers, fourteen days, and Google opens production.",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            textAlign = TextAlign.Center,
        )
        Spacer(Modifier.height(28.dp))
        Button(onClick = onSignIn, enabled = !busy) {
            Text(if (busy) "Signing in…" else "Sign in with Google")
        }
    }
}

// ---------------------------------------------------------------------------
// Catalogue
// ---------------------------------------------------------------------------

@Composable
fun CatalogueScreen(
    apps: List<AppListing>,
    reservations: List<Reservation>,
    busy: Boolean,
    onReserve: (AppListing) -> Unit,
    onOpen: (AppListing) -> Unit,
) {
    val joined = reservations.filter { it.status != "withdrawn" && it.status != "expired" }
        .map { it.appId }
        .toSet()

    if (apps.isEmpty()) {
        EmptyState(
            title = "No apps need testers right now",
            body = "New listings appear here as developers open their tracks.",
        )
        return
    }

    LazyColumn(
        contentPadding = PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        items(apps, key = { it.id }) { app ->
            AppCard(
                app = app,
                alreadyJoined = app.id in joined,
                busy = busy,
                onReserve = { onReserve(app) },
                onOpen = { onOpen(app) },
            )
        }
    }
}

@Composable
private fun AppCard(
    app: AppListing,
    alreadyJoined: Boolean,
    busy: Boolean,
    onReserve: () -> Unit,
    onOpen: () -> Unit,
) {
    Card(
        modifier = Modifier.fillMaxWidth().clickable(onClick = onOpen),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
    ) {
        Column(Modifier.padding(16.dp)) {
            Text(app.name, style = MaterialTheme.typography.titleMedium)
            Text(
                app.packageName,
                style = MaterialTheme.typography.bodySmall,
                fontFamily = FontFamily.Monospace,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            Spacer(Modifier.height(8.dp))
            Text(
                app.shortDescription,
                style = MaterialTheme.typography.bodyMedium,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
            )
            Spacer(Modifier.height(12.dp))
            Row(
                Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    "${app.openSlots} of ${app.seatsRequested} slots open",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                if (alreadyJoined) {
                    Text(
                        "Joined",
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.primary,
                    )
                } else {
                    Button(onClick = onReserve, enabled = !busy && app.openSlots > 0) {
                        Text("Join test")
                    }
                }
            }
        }
    }
}

// ---------------------------------------------------------------------------
// My tests
// ---------------------------------------------------------------------------

@Composable
fun MyTestsScreen(
    reservations: List<Reservation>,
    apps: Map<String, AppListing>,
    config: PlatformConfig,
    busy: Boolean,
    evidenceFor: (String) -> InstallEvidence,
    onCheckIn: (AppListing) -> Unit,
    onWithdraw: (String) -> Unit,
    onOpenTestLink: (AppListing) -> Unit,
) {
    if (reservations.isEmpty()) {
        EmptyState(
            title = "You have not joined a test yet",
            body = "Every test you complete earns a seat, and seats are what get testers onto your own app.",
        )
        return
    }

    LazyColumn(
        contentPadding = PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        items(reservations, key = { it.id }) { reservation ->
            val app = apps[reservation.appId]
            ReservationCard(
                reservation = reservation,
                app = app,
                config = config,
                busy = busy,
                evidence = app?.let { evidenceFor(it.packageName) },
                onCheckIn = { app?.let(onCheckIn) },
                onWithdraw = { onWithdraw(reservation.appId) },
                onOpenTestLink = { app?.let(onOpenTestLink) },
            )
        }
    }
}

@Composable
private fun ReservationCard(
    reservation: Reservation,
    app: AppListing?,
    config: PlatformConfig,
    busy: Boolean,
    evidence: InstallEvidence?,
    onCheckIn: () -> Unit,
    onWithdraw: () -> Unit,
    onOpenTestLink: () -> Unit,
) {
    Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface)) {
        Column(Modifier.padding(16.dp)) {
            Row(
                Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(app?.name ?: reservation.appId, style = MaterialTheme.typography.titleMedium)
                StatusPill(reservation.status)
            }

            if (reservation.status == "approved") {
                Spacer(Modifier.height(12.dp))
                Text(
                    "Day ${reservation.daysCheckedIn} of ${config.requiredDays} checked in" +
                        if (reservation.checkinStreak > 1) " · ${reservation.checkinStreak}-day streak" else "",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Spacer(Modifier.height(6.dp))
                LinearProgressIndicator(
                    progress = {
                        (reservation.daysCheckedIn.toFloat() / config.requiredDays).coerceIn(0f, 1f)
                    },
                    modifier = Modifier.fillMaxWidth().height(6.dp).clip(RoundedCornerShape(3.dp)),
                )
            }

            if (evidence != null) {
                Spacer(Modifier.height(12.dp))
                InstallStatus(evidence)
            }

            Spacer(Modifier.height(12.dp))
            HorizontalDivider(color = MaterialTheme.colorScheme.outline)
            Spacer(Modifier.height(8.dp))

            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                when (reservation.status) {
                    "approved" -> Button(onClick = onCheckIn, enabled = !busy) { Text("Check in") }
                    "reserved" -> {
                        Button(onClick = onOpenTestLink, enabled = !busy && app != null) { Text("Open test link") }
                        TextButton(onClick = onWithdraw, enabled = !busy) { Text("Withdraw") }
                    }
                    "proof_submitted" -> Text(
                        "Waiting on the developer to review your proof.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    "rejected" -> Text(
                        reservation.rejectionReason ?: "The developer rejected this proof.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.error,
                    )
                    else -> OutlinedButton(onClick = onOpenTestLink, enabled = app != null) {
                        Text("Open in Play")
                    }
                }
            }
        }
    }
}

/**
 * The line that makes this app worth installing: what the device can actually see, as
 * opposed to what a screenshot claims.
 */
@Composable
private fun InstallStatus(evidence: InstallEvidence) {
    val (text, color) = when {
        !evidence.installed ->
            "Not installed on this device" to MaterialTheme.colorScheme.onSurfaceVariant

        !evidence.fromPlayStore ->
            "Installed, but not from Play — a closed test has to come through the Play link" to
                MaterialTheme.colorScheme.secondary

        else -> {
            val days = evidence.firstInstallAt?.let {
                TimeUnit.MILLISECONDS.toDays(System.currentTimeMillis() - it.time)
            }
            val since = when {
                days == null -> ""
                days <= 0L -> " · installed today"
                days == 1L -> " · installed yesterday"
                else -> " · installed $days days ago"
            }
            "Installed from Play${evidence.versionName?.let { " · v$it" } ?: ""}$since" to
                MaterialTheme.colorScheme.primary
        }
    }

    Text(text, style = MaterialTheme.typography.bodySmall, color = color)
}

@Composable
private fun StatusPill(status: String) {
    val color = when (status) {
        "approved" -> MaterialTheme.colorScheme.primary
        "rejected", "expired" -> MaterialTheme.colorScheme.error
        "proof_submitted" -> MaterialTheme.colorScheme.secondary
        else -> MaterialTheme.colorScheme.onSurfaceVariant
    }
    Box(
        Modifier
            .clip(RoundedCornerShape(999.dp))
            .background(MaterialTheme.colorScheme.surfaceVariant)
            .padding(horizontal = 10.dp, vertical = 4.dp),
    ) {
        Text(status.replace('_', ' '), style = MaterialTheme.typography.labelSmall, color = color)
    }
}

// ---------------------------------------------------------------------------
// shared bits
// ---------------------------------------------------------------------------

@Composable
fun EmptyState(title: String, body: String) {
    Column(
        modifier = Modifier.fillMaxSize().padding(32.dp),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text(title, style = MaterialTheme.typography.titleMedium)
        Spacer(Modifier.height(8.dp))
        Text(
            body,
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            textAlign = TextAlign.Center,
        )
    }
}

@Composable
fun LoadingBox() {
    Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        CircularProgressIndicator(Modifier.size(28.dp))
    }
}
