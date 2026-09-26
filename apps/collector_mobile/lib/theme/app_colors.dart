import 'package:flutter/material.dart';

/// Design tokens for the collector app.
///
/// Deliberately identical to `borrower_mobile/lib/theme/app_colors.dart` for the
/// shared tokens, so the two apps read as one product and a widget moved between
/// them keeps working. The collector-only additions below (channel accents, level
/// tints) sit underneath the same naming.
abstract final class AppColors {
  static const background = Color(0xFFF6F8FA);
  static const surface = Color(0xFFFFFFFF);
  static const surfaceMuted = Color(0xFFEDF2F5);

  static const text = Color(0xFF172B3A);
  static const textMuted = Color(0xFF526473);

  /// ALL-CAPS section labels and de-emphasised metadata.
  static const textLabel = Color(0xFF7A8895);
  static const textDim = Color(0xFF3D5061);
  static const hint = Color(0xFF9AA7B4);

  static const border = Color(0xFFCBD5DF);
  static const borderSoft = Color(0xFFE3EAF0);

  static const primary = Color(0xFF047857);
  static const onPrimary = Color(0xFFFFFFFF);

  static const successTint = Color(0xFFE5F5ED);
  static const errorTint = Color(0xFFFFECEC);
  static const error = Color(0xFFB42318);
  static const errorSoft = Color(0xFFD64545);
  static const warning = Color(0xFF925700);
  static const warningTint = Color(0xFFFFF4E0);
  static const warningSoft = Color(0xFFB07400);

  static const info = Color(0xFF1D4ED8);
  static const infoTint = Color(0xFFE8EFFD);

  /// Per-channel accents, matching the admin dashboard's channel colours.
  static const channelCall = Color(0xFF1D4ED8);
  static const channelWhatsapp = Color(0xFF047857);
  static const channelSms = Color(0xFF6D28D9);
  static const channelUssd = Color(0xFF925700);

  /// Kept for the few places that still want a dark-on-light inverse (the day
  /// summary card).
  static const inverseSurface = Color(0xFF172B3A);
  static const onInverse = Color(0xFFF6F8FA);
  static const onInverseMuted = Color(0xFFA9BACA);
}
