import 'dart:io';

import 'package:call_log/call_log.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../utils/call_matching.dart';

/// Reads the device call log to recover a call's real duration.
///
/// Android only — iOS exposes no call-log API at all, so every iOS install falls
/// back to the self-reported path and the recorded `durationSource` says so.
///
/// Permission goes through a MethodChannel rather than `permission_handler`: that
/// package has no `Permission.callLog` (only `Permission.phone`, which requests the
/// whole PHONE group), and its Android half requires compileSdk 37. See
/// `MainActivity.kt`.
class CallLogService {
  static const _channel =
      MethodChannel('tz.realmoney.collector/call_log_permission');

  /// Only Android can do this.
  static bool get isSupported => !kIsWeb && Platform.isAndroid;

  /// Never throws: a denied permission is a normal outcome that degrades to
  /// self-reporting, not an error worth surfacing.
  static Future<bool> _invoke(String method) async {
    if (!isSupported) return false;
    try {
      return await _channel.invokeMethod<bool>(method) ?? false;
    } on PlatformException catch (error) {
      debugPrint('Call log permission $method failed: $error');
      return false;
    } on MissingPluginException {
      // Running on a host build without the Android side wired up.
      return false;
    }
  }

  /// Remembers that the system dialog has been shown at least once. See
  /// [isPermanentlyDenied] for why this cannot be inferred from Android alone.
  static const _askedKey = 'call_log_permission_requested';

  static Future<bool> hasPermission() => _invoke('check');

  static Future<bool> requestPermission() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool(_askedKey, true);
    return _invoke('request');
  }

  /// True once Android will no longer show the dialog, so the UI can offer app
  /// settings instead of a prompt that does nothing.
  ///
  /// `shouldShowRequestPermissionRationale` alone cannot answer this: Android
  /// returns false both *before* the permission has ever been requested and *after*
  /// the user selects "don't ask again". Treating the first case as a permanent
  /// denial means never asking at all, so this also requires that we have actually
  /// asked once.
  static Future<bool> isPermanentlyDenied() async {
    if (!isSupported) return false;
    final prefs = await SharedPreferences.getInstance();
    if (prefs.getBool(_askedKey) != true) return false;
    return _invoke('isPermanentlyDenied');
  }

  static Future<void> openSettings() async {
    await _invoke('openSettings');
  }

  /// Finds the call the collector just placed.
  ///
  /// Polls, because Android writes the call-log row slightly *after* the call ends —
  /// a single immediate read usually finds nothing. Five attempts over ~3.5s covers
  /// the observed lag without making the collector wait on a call that never
  /// happened.
  static Future<CallEvidence> findCall({
    required String phone,
    required DateTime since,
    int attempts = 5,
    Duration gap = const Duration(milliseconds: 700),
  }) async {
    if (!isSupported || !await hasPermission()) return CallEvidence.none;

    for (var attempt = 0; attempt < attempts; attempt++) {
      if (attempt > 0) await Future<void>.delayed(gap);
      try {
        // Query by time only, never by `number`: the plugin's number filter is an
        // exact match and the log stores whatever formatting the dialer received,
        // so `+255…` would miss a call dialled as `0712…`.
        final entries = await CallLog.query(
          dateFrom: since.millisecondsSinceEpoch,
        );
        final evidence = pickCall(
          entries.map(_toRecord).toList(),
          phone: phone,
          since: since,
        );
        if (evidence != null) return evidence;
      } catch (error) {
        debugPrint('Call log read failed: $error');
        return CallEvidence.none;
      }
    }
    return CallEvidence.none;
  }

  static CallRecord _toRecord(CallLogEntry entry) {
    return CallRecord(
      number: entry.number ?? entry.formattedNumber ?? '',
      type: entry.callType?.name ?? '',
      durationSeconds: entry.duration ?? 0,
      startedAt: DateTime.fromMillisecondsSinceEpoch(entry.timestamp ?? 0),
    );
  }
}
