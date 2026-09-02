package tech.mehdiacho.atesters.ui

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.google.firebase.auth.FirebaseUser
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.catch
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import tech.mehdiacho.atesters.data.AppListing
import tech.mehdiacho.atesters.data.AuthRepository
import tech.mehdiacho.atesters.data.CallableError
import tech.mehdiacho.atesters.data.InstallCheck
import tech.mehdiacho.atesters.data.PlatformConfig
import tech.mehdiacho.atesters.data.Repository
import tech.mehdiacho.atesters.data.Reservation
import tech.mehdiacho.atesters.data.UserProfile

@OptIn(ExperimentalCoroutinesApi::class)
class AppViewModel(app: Application) : AndroidViewModel(app) {

    private val context get() = getApplication<Application>()

    val user: StateFlow<FirebaseUser?> =
        AuthRepository.authState().stateIn(viewModelScope, SharingStarted.Eagerly, AuthRepository.currentUser)

    val profile: StateFlow<UserProfile?> = user
        .flatMapLatest { u -> if (u == null) flowOf(null) else Repository.profile(u.uid).catch { emit(null) } }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), null)

    val config: StateFlow<PlatformConfig> = Repository.platformConfig()
        .catch { emit(PlatformConfig()) }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), PlatformConfig())

    val openApps: StateFlow<List<AppListing>> = Repository.openApps()
        .catch { emit(emptyList()) }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyList())

    val myReservations: StateFlow<List<Reservation>> = user
        .flatMapLatest { u ->
            if (u == null) flowOf(emptyList()) else Repository.myReservations(u.uid).catch { emit(emptyList()) }
        }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyList())

    private val _busy = MutableStateFlow(false)
    val busy: StateFlow<Boolean> = _busy.asStateFlow()

    private val _message = MutableStateFlow<String?>(null)
    val message: StateFlow<String?> = _message.asStateFlow()

    fun clearMessage() {
        _message.value = null
    }

    fun signIn() = run {
        _busy.value = true
        viewModelScope.launch {
            AuthRepository.signIn(context)
                .onFailure { _message.value = it.message ?: "Sign-in failed." }
            _busy.value = false
        }
    }

    fun signOut() = AuthRepository.signOut()

    fun reserve(app: AppListing) = perform("Slot reserved. Join the group, then install from Play.") {
        Repository.reserveSlot(app.id)
    }

    fun withdraw(appId: String) = perform("Reservation withdrawn.") {
        Repository.withdrawReservation(appId)
    }

    /**
     * The check-in carries what the device can see about the app right now. If it is not
     * installed we say so rather than sending a check-in that claims otherwise — the
     * whole point of doing this on a phone is that the answer is observed, not asserted.
     */
    fun checkIn(app: AppListing) {
        val evidence = InstallCheck.evidenceFor(context, app.packageName)
        if (!evidence.installed) {
            _message.value = "${app.name} is not installed on this device. Install it from the test link first."
            return
        }
        perform("Checked in for today. Keep it up — the streak is what Google counts.") {
            Repository.recordCheckin(app.id, evidence)
        }
    }

    fun installEvidenceFor(packageName: String) = InstallCheck.evidenceFor(context, packageName)

    private fun perform(success: String, block: suspend () -> Unit) {
        _busy.value = true
        viewModelScope.launch {
            _message.value = try {
                block()
                success
            } catch (e: CallableError) {
                humanise(e.reason)
            } catch (e: Exception) {
                e.message ?: "Something went wrong."
            }
            _busy.value = false
        }
    }
}

/** The callables' machine-readable reasons, in the words a tester would use. */
private fun humanise(reason: String): String = when (reason) {
    "no_slots" -> "That listing just filled up."
    "own_app" -> "You cannot test your own app."
    "already_reserved" -> "You already have a slot on this app."
    "too_many_open" -> "You have too many tests open. Finish one before starting another."
    "not_open" -> "That listing is not accepting testers right now."
    "low_reputation" -> "Your reputation is too low to join this test."
    "expired" -> "That reservation expired."
    "not_approved" -> "Check-ins start once the developer approves your proof."
    else -> reason
}
