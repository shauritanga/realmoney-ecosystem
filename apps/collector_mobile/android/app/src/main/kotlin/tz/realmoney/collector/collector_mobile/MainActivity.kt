package tz.realmoney.collector.collector_mobile

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.provider.Settings
import androidx.annotation.NonNull
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodCall
import io.flutter.plugin.common.MethodChannel

/**
 * Requests READ_CALL_LOG directly.
 *
 * `permission_handler` was used for this at first, but it exposes no
 * `Permission.callLog` — the closest is `Permission.phone`, which requests the whole
 * PHONE group and only happens to surface the call-log dialog. It also pulled in
 * permission_handler_android, which requires compileSdk 37. Forty lines here ask for
 * the exact permission, with no extra dependency and no SDK bump.
 */
class MainActivity : FlutterActivity() {
    private companion object {
        const val CHANNEL = "tz.realmoney.collector/call_log_permission"
        const val REQUEST_CODE = 9001
    }

    /// Held across the permission dialog so the Dart side gets one reply per request.
    private var pendingResult: MethodChannel.Result? = null

    override fun configureFlutterEngine(@NonNull flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)
        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, CHANNEL)
            .setMethodCallHandler { call, result -> handle(call, result) }
    }

    private fun handle(call: MethodCall, result: MethodChannel.Result) {
        when (call.method) {
            "check" -> result.success(hasPermission())

            "request" -> {
                if (hasPermission()) {
                    result.success(true)
                    return
                }
                // A second concurrent request would orphan the first callback, and
                // Flutter throws if a result is never delivered.
                if (pendingResult != null) {
                    result.success(false)
                    return
                }
                pendingResult = result
                ActivityCompat.requestPermissions(
                    this,
                    arrayOf(Manifest.permission.READ_CALL_LOG),
                    REQUEST_CODE,
                )
            }

            // True once Android will no longer show the dialog, so the app can offer
            // app settings instead of a prompt that does nothing.
            "isPermanentlyDenied" -> result.success(
                !hasPermission() &&
                    !ActivityCompat.shouldShowRequestPermissionRationale(
                        this,
                        Manifest.permission.READ_CALL_LOG,
                    ),
            )

            "openSettings" -> {
                startActivity(
                    Intent(
                        Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
                        Uri.fromParts("package", packageName, null),
                    ),
                )
                result.success(true)
            }

            else -> result.notImplemented()
        }
    }

    private fun hasPermission(): Boolean =
        ContextCompat.checkSelfPermission(this, Manifest.permission.READ_CALL_LOG) ==
            PackageManager.PERMISSION_GRANTED

    override fun onRequestPermissionsResult(
        requestCode: Int,
        permissions: Array<out String>,
        grantResults: IntArray,
    ) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (requestCode != REQUEST_CODE) return
        val granted = grantResults.isNotEmpty() &&
            grantResults[0] == PackageManager.PERMISSION_GRANTED
        pendingResult?.success(granted)
        pendingResult = null
    }
}
