import 'package:flutter/material.dart';

import '../theme/app_colors.dart';

/// Time-of-day greeting used in the borrower home header.
String greetingFor(DateTime now) {
  final hour = now.hour;
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

/// First word of the borrower's legal name, or null when unknown.
String? firstNameOf(String? fullName) {
  final parts = (fullName ?? '')
      .trim()
      .split(RegExp(r'\s+'))
      .where((part) => part.isNotEmpty)
      .toList();
  return parts.isEmpty ? null : parts.first;
}

/// Up to two initials for the circular home-header avatar.
String initialsFor(String? fullName) {
  final parts = (fullName ?? '')
      .trim()
      .split(RegExp(r'\s+'))
      .where((part) => part.isNotEmpty)
      .toList();
  if (parts.isEmpty) return 'RM';
  if (parts.length == 1) {
    final word = parts.first;
    return (word.length >= 2 ? word.substring(0, 2) : word).toUpperCase();
  }
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

/// Home-screen header title: circular avatar plus greeting.
///
/// Replaces the logo mark so the borrower sees their own account the moment
/// the home tab opens.
class HomeHeaderTitle extends StatelessWidget {
  final String? fullName;
  final DateTime? now;

  const HomeHeaderTitle({super.key, required this.fullName, this.now});

  @override
  Widget build(BuildContext context) {
    final first = firstNameOf(fullName);
    final greeting = greetingFor(now ?? DateTime.now());
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        CircleAvatar(
          radius: 19,
          backgroundColor: AppColors.primary,
          child: Text(
            initialsFor(fullName),
            style: const TextStyle(
              color: AppColors.onPrimary,
              fontWeight: FontWeight.w700,
              fontSize: 14,
            ),
          ),
        ),
        const SizedBox(width: 12),
        Flexible(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                first == null ? greeting : '$greeting, $first',
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(
                  fontSize: 16,
                  fontWeight: FontWeight.w700,
                ),
              ),
              const Text(
                'Welcome back',
                style: TextStyle(
                  fontSize: 12,
                  color: AppColors.textMuted,
                  fontWeight: FontWeight.w400,
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }
}
