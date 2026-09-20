import 'package:flutter/foundation.dart';
import 'package:smart_auth/smart_auth.dart';

/// Reads only the single message approved in Android's SMS consent dialog.
class SmsCodeService {
  bool get supported => !kIsWeb && defaultTargetPlatform == TargetPlatform.android;

  Future<String?> listen() async {
    if (!supported) return null;
    final result = await SmartAuth.instance.getSmsWithUserConsentApi();
    if (!result.hasData) return null;
    // Ignore unrelated verification messages; the backend still validates the code.
    return RegExp(r'Your realMoney verification code is (\d{6})\.')
        .firstMatch(result.requireData.sms)?.group(1);
  }

  Future<void> stop() async {
    if (supported) await SmartAuth.instance.removeUserConsentApiListener();
  }
}
