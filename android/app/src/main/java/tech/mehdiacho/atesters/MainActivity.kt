package tech.mehdiacho.atesters

import android.content.Intent
import android.net.Uri
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.automirrored.filled.List
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import tech.mehdiacho.atesters.data.AppListing
import tech.mehdiacho.atesters.ui.AppViewModel
import tech.mehdiacho.atesters.ui.CatalogueScreen
import tech.mehdiacho.atesters.ui.MyTestsScreen
import tech.mehdiacho.atesters.ui.SignInScreen
import tech.mehdiacho.atesters.ui.theme.ATestersTheme

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            ATestersTheme {
                Surface(Modifier.fillMaxSize(), color = MaterialTheme.colorScheme.background) {
                    Root(onOpenUrl = ::openUrl)
                }
            }
        }
    }

    private fun openUrl(url: String) {
        if (url.isBlank()) return
        runCatching { startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url))) }
    }
}

private enum class Tab { Browse, MyTests }

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun Root(onOpenUrl: (String) -> Unit) {
    val vm: AppViewModel = viewModel()
    val user by vm.user.collectAsStateWithLifecycle()
    val busy by vm.busy.collectAsStateWithLifecycle()
    val message by vm.message.collectAsStateWithLifecycle()

    val snackbar = remember { SnackbarHostState() }
    LaunchedEffect(message) {
        message?.let {
            snackbar.showSnackbar(it)
            vm.clearMessage()
        }
    }

    if (user == null) {
        Scaffold(snackbarHost = { SnackbarHost(snackbar) }) { padding ->
            Column(Modifier.padding(padding)) {
                SignInScreen(busy = busy, onSignIn = vm::signIn)
            }
        }
        return
    }

    val apps by vm.openApps.collectAsStateWithLifecycle()
    val reservations by vm.myReservations.collectAsStateWithLifecycle()
    val profile by vm.profile.collectAsStateWithLifecycle()
    val config by vm.config.collectAsStateWithLifecycle()

    var tab by remember { mutableStateOf(Tab.Browse) }

    // My tests needs the listing behind each reservation, and a tester can hold a
    // reservation on an app that has since closed — so this map is what is available,
    // not what is guaranteed, and the UI degrades to the app id when one is missing.
    val appsById: Map<String, AppListing> = remember(apps) { apps.associateBy { it.id } }

    Scaffold(
        snackbarHost = { SnackbarHost(snackbar) },
        topBar = {
            TopAppBar(
                title = { Text(if (tab == Tab.Browse) "Apps to test" else "My testing") },
                actions = {
                    Text(
                        "${profile?.seatBalance ?: 0} seats",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    TextButton(onClick = vm::signOut) { Text("Sign out") }
                },
            )
        },
        bottomBar = {
            NavigationBar {
                NavigationBarItem(
                    selected = tab == Tab.Browse,
                    onClick = { tab = Tab.Browse },
                    icon = { Icon(Icons.AutoMirrored.Filled.List, contentDescription = null) },
                    label = { Text("Browse") },
                )
                NavigationBarItem(
                    selected = tab == Tab.MyTests,
                    onClick = { tab = Tab.MyTests },
                    icon = { Icon(Icons.Filled.CheckCircle, contentDescription = null) },
                    label = { Text("My testing") },
                )
            }
        },
    ) { padding ->
        Column(Modifier.padding(padding)) {
            when (tab) {
                Tab.Browse -> CatalogueScreen(
                    apps = apps,
                    reservations = reservations,
                    busy = busy,
                    onReserve = vm::reserve,
                    onOpen = { onOpenUrl(it.playTestUrl) },
                )

                Tab.MyTests -> MyTestsScreen(
                    reservations = reservations,
                    apps = appsById,
                    config = config,
                    busy = busy,
                    evidenceFor = vm::installEvidenceFor,
                    onCheckIn = vm::checkIn,
                    onWithdraw = vm::withdraw,
                    onOpenTestLink = { onOpenUrl(it.playTestUrl) },
                )
            }
        }
    }
}
