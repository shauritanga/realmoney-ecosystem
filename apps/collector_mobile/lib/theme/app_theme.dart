import 'package:flutter/material.dart';
import 'app_colors.dart';

/// Centralised theme, mirroring the borrower app so the two look like one product.
///
/// Light only, and pinned with `themeMode: ThemeMode.light` at the MaterialApp: the
/// app previously declared `Brightness.dark` outright, which made it render dark on
/// a phone that was not in dark mode.
final ThemeData collectorTheme = ThemeData(
  brightness: Brightness.light,
  scaffoldBackgroundColor: AppColors.background,
  colorScheme: const ColorScheme.light(
    primary: AppColors.primary,
    onPrimary: AppColors.onPrimary,
    surface: AppColors.surface,
    onSurface: AppColors.text,
    error: AppColors.error,
    outline: AppColors.border,
  ),
  appBarTheme: const AppBarTheme(
    backgroundColor: AppColors.surface,
    foregroundColor: AppColors.text,
    surfaceTintColor: Colors.transparent,
    elevation: 0,
    scrolledUnderElevation: 0.5,
  ),
  navigationBarTheme: NavigationBarThemeData(
    backgroundColor: AppColors.surface,
    surfaceTintColor: Colors.transparent,
    indicatorColor: AppColors.successTint,
    elevation: 3,
    labelTextStyle: WidgetStateProperty.resolveWith(
      (states) => TextStyle(
        fontSize: 11,
        fontWeight: states.contains(WidgetState.selected)
            ? FontWeight.w700
            : FontWeight.w500,
        color: states.contains(WidgetState.selected)
            ? AppColors.primary
            : AppColors.textMuted,
      ),
    ),
    iconTheme: WidgetStateProperty.resolveWith(
      (states) => IconThemeData(
        size: 22,
        color: states.contains(WidgetState.selected)
            ? AppColors.primary
            : AppColors.textMuted,
      ),
    ),
  ),
  inputDecorationTheme: const InputDecorationTheme(
    filled: true,
    fillColor: AppColors.surface,
    hintStyle: TextStyle(color: AppColors.hint),
    border: OutlineInputBorder(borderSide: BorderSide(color: AppColors.border)),
    enabledBorder: OutlineInputBorder(borderSide: BorderSide(color: AppColors.border)),
    focusedBorder: OutlineInputBorder(borderSide: BorderSide(color: AppColors.primary)),
  ),
  bottomSheetTheme: const BottomSheetThemeData(
    backgroundColor: AppColors.surface,
    surfaceTintColor: Colors.transparent,
  ),
  dialogTheme: const DialogThemeData(
    backgroundColor: AppColors.surface,
    surfaceTintColor: Colors.transparent,
  ),
  snackBarTheme: const SnackBarThemeData(
    backgroundColor: AppColors.inverseSurface,
    contentTextStyle: TextStyle(color: AppColors.onInverse),
    behavior: SnackBarBehavior.floating,
  ),
  dividerTheme: const DividerThemeData(color: AppColors.borderSoft, thickness: 1),
  useMaterial3: true,
);
