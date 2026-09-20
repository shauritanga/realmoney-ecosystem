import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:timezone/data/latest_all.dart' as tzdata;
import 'package:timezone/timezone.dart' as tz;
import 'api_service.dart';

@pragma('vm:entry-point')
Future<void> pushBackgroundHandler(RemoteMessage message) async {
  // Background isolate: keep minimal. On Android FCM still delivers
  // high-priority loan messages to the tray even without further handling.
}

/// Central push entry point for the borrower app.
///
/// Server-sent loan updates arrive over Firebase Cloud Messaging; repayment
/// nudges are scheduled locally from the active loan's due date so they work
/// even when the backend has no scheduler running.
class PushService {
  static final FlutterLocalNotificationsPlugin _local =
      FlutterLocalNotificationsPlugin();
  static bool _ready = false;

  static const AndroidNotificationChannel _channel = AndroidNotificationChannel(
    'loan_updates',
    'Loan updates',
    description: 'Loan approvals, payouts and repayment reminders',
    importance: Importance.high,
  );

  /// Call once from main() before runApp. Never throws: when Firebase is not
  /// configured (e.g. missing google-services.json) push stays disabled.
  static Future<void> init() async {
    if (_ready) return;
    tzdata.initializeTimeZones();
    try {
      await Firebase.initializeApp();
    } catch (_) {
      return;
    }
    FirebaseMessaging.onBackgroundMessage(pushBackgroundHandler);
    await _local
        .resolvePlatformSpecificImplementation<
            AndroidFlutterLocalNotificationsPlugin>()
        ?.createNotificationChannel(_channel);
    await _local.initialize(const InitializationSettings(
      android: AndroidInitializationSettings('@mipmap/ic_launcher'),
    ));
    FirebaseMessaging.onMessage.listen(_showForeground);
    FirebaseMessaging.instance.onTokenRefresh.listen((token) {
      ApiService.registerPushToken(token);
    });
    _ready = true;
  }

  /// Call after the borrower is authenticated. Requests permission, fetches
  /// the FCM token and uploads it. Best-effort: never throws.
  static Future<void> onAuthenticated() async {
    if (!_ready) return;
    try {
      final permission = await FirebaseMessaging.instance.requestPermission();
      if (permission.authorizationStatus == AuthorizationStatus.denied) return;
      await _local
          .resolvePlatformSpecificImplementation<
              AndroidFlutterLocalNotificationsPlugin>()
          ?.requestNotificationsPermission();
      final token = await FirebaseMessaging.instance.getToken();
      if (token != null && token.isNotEmpty) {
        await ApiService.registerPushToken(token);
      }
    } catch (_) {}
  }

  /// Call on logout, before the auth token is cleared. Best-effort.
  static Future<void> onSignedOut() async {
    try {
      final token = await FirebaseMessaging.instance.getToken();
      if (token != null && token.isNotEmpty) {
        await ApiService.unregisterPushToken(token);
      }
    } catch (_) {}
    try {
      await FirebaseMessaging.instance.deleteToken();
    } catch (_) {}
    await cancelReminders();
  }

  static Future<void> _showForeground(RemoteMessage message) async {
    final notification = message.notification;
    if (notification == null) return;
    await _local.show(
      notification.hashCode,
      notification.title,
      notification.body,
      NotificationDetails(
        android: AndroidNotificationDetails(
          _channel.id,
          _channel.name,
          channelDescription: _channel.description,
          importance: Importance.high,
          priority: Priority.high,
        ),
      ),
      payload: message.data['loanId']?.toString(),
    );
  }

  static const int _reminderBaseId = 7000;

  /// Schedules "due in 2 days" and "due today" nudges at 9am local time for
  /// the active loan. Past instants are skipped. Call [cancelReminders] (or
  /// reschedule) when the loan list no longer has a payable loan.
  static Future<void> scheduleDueReminders({
    required DateTime dueDate,
    required double outstanding,
    required String loanNumber,
  }) async {
    await cancelReminders();
    if (!_ready) return;
    final balance = 'TZS ${outstanding.toStringAsFixed(0)} outstanding.';
    await _scheduleAt(
      _atTime(dueDate.subtract(const Duration(days: 2)), 9),
      _reminderBaseId,
      'Repayment due in 2 days',
      'Loan $loanNumber: $balance',
    );
    await _scheduleAt(
      _atTime(dueDate, 9),
      _reminderBaseId + 1,
      'Repayment due today',
      'Loan $loanNumber: $balance',
    );
  }

  static DateTime _atTime(DateTime day, int hour) =>
      DateTime(day.year, day.month, day.day, hour);

  static Future<void> _scheduleAt(
      DateTime local, int id, String title, String body) async {
    if (!local.isAfter(DateTime.now())) return;
    try {
      await _local.zonedSchedule(
        id,
        title,
        body,
        tz.TZDateTime.from(local.toUtc(), tz.UTC),
        NotificationDetails(
          android: AndroidNotificationDetails(
            _channel.id,
            _channel.name,
            channelDescription: _channel.description,
            importance: Importance.high,
            priority: Priority.high,
          ),
        ),
        androidScheduleMode: AndroidScheduleMode.inexactAllowWhileIdle,
        uiLocalNotificationDateInterpretation:
            UILocalNotificationDateInterpretation.absoluteTime,
      );
    } catch (_) {}
  }

  static Future<void> cancelReminders() async {
    try {
      await _local.cancel(_reminderBaseId);
      await _local.cancel(_reminderBaseId + 1);
    } catch (_) {}
  }
}
