package tech.mehdiacho.atesters

import android.app.Application
import tech.mehdiacho.atesters.data.FirebaseServices

class AtestersApplication : Application() {
    override fun onCreate() {
        super.onCreate()
        // Must happen before any SDK opens a connection, so it belongs here rather than
        // in an Activity that can be recreated.
        FirebaseServices.connectEmulatorsIfConfigured()
    }
}
