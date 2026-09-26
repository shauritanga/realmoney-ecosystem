import 'package:hugeicons/hugeicons.dart';

export 'package:hugeicons/hugeicons.dart' show HugeIcon;

/// Hugeicons ship icon data as a nested list rather than Flutter's [IconData], so
/// any widget taking one of these icons as a parameter has to say so.
typedef HugeIconData = List<List<dynamic>>;

/// Every icon the app uses, named once.
///
/// Matches the borrower app's icon set so the two read as one product. Naming them
/// here rather than reaching for `HugeIcons.strokeRoundedX` at each call site means a
/// swap is one edit, and a screen cannot quietly pick a different icon for the same
/// concept.
abstract final class AppIcons {
  // Navigation
  static const home = HugeIcons.strokeRoundedHome01;
  static const cases = HugeIcons.strokeRoundedFolderLibrary;
  static const promises = HugeIcons.strokeRoundedAgreement01;
  static const profile = HugeIcons.strokeRoundedUserCircle;

  // Contact channels
  static const call = HugeIcons.strokeRoundedCall02;
  static const callOutgoing = HugeIcons.strokeRoundedCallOutgoing01;
  static const callback = HugeIcons.strokeRoundedCallReceived;
  static const noAnswer = HugeIcons.strokeRoundedPhoneOff01;
  static const whatsapp = HugeIcons.strokeRoundedWhatsapp;
  static const sms = HugeIcons.strokeRoundedMessage01;
  static const ussd = HugeIcons.strokeRoundedFlash;

  // Actions
  static const refresh = HugeIcons.strokeRoundedRefresh;
  static const search = HugeIcons.strokeRoundedSearch01;
  static const clear = HugeIcons.strokeRoundedCancel01;
  static const record = HugeIcons.strokeRoundedNote01;
  static const signOut = HugeIcons.strokeRoundedLogout01;
  static const chevron = HugeIcons.strokeRoundedArrowRight01;
  static const calendar = HugeIcons.strokeRoundedCalendar03;
  static const clock = HugeIcons.strokeRoundedClock01;

  // Status
  static const success = HugeIcons.strokeRoundedCheckmarkCircle02;
  static const alert = HugeIcons.strokeRoundedAlert02;
  static const info = HugeIcons.strokeRoundedInformationCircle;
  static const offline = HugeIcons.strokeRoundedWifiDisconnected01;
  static const verified = HugeIcons.strokeRoundedCheckmarkBadge01;
  static const selfReported = HugeIcons.strokeRoundedEdit02;
  static const locked = HugeIcons.strokeRoundedSquareLock01;

  // Money and reporting
  static const money = HugeIcons.strokeRoundedCoins01;
  static const inbox = HugeIcons.strokeRoundedInboxDownload;
  static const settings = HugeIcons.strokeRoundedSettings01;

  // Form fields. Plain glyphs, not the circle- and square-enclosed variants used for
  // navigation: an enclosed icon carries far more visual weight and, sat inside a
  // text field, competes with the text it is labelling.
  static const fieldUser = HugeIcons.strokeRoundedUser;
  static const fieldPassword = HugeIcons.strokeRoundedLockPassword;
}
