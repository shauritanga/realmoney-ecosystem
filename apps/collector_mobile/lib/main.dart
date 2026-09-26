import 'package:flutter/material.dart';

import 'screens/main_shell.dart';
import 'screens/login_screen.dart';
import 'services/api_service.dart';
import 'theme/app_theme.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  final token = await ApiService.getToken();
  runApp(CollectorApp(isLoggedIn: token != null));
}

class CollectorApp extends StatelessWidget {
  final bool isLoggedIn;

  const CollectorApp({super.key, required this.isLoggedIn});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'RealMoney Collector',
      debugShowCheckedModeBanner: false,
      theme: collectorTheme,
      // Pinned to light: the app previously declared Brightness.dark outright, so it
      // rendered dark on phones that were not in dark mode.
      themeMode: ThemeMode.light,
      home: AuthGate(isLoggedIn: isLoggedIn),
    );
  }
}

/// Returns to the login screen when the session expires.
///
/// Before this, an expired token made every request fail with "Failed to load
/// collection queue" forever — there was no path back to login short of clearing
/// the app's data.
class AuthGate extends StatefulWidget {
  final bool isLoggedIn;

  const AuthGate({super.key, required this.isLoggedIn});

  @override
  State<AuthGate> createState() => _AuthGateState();
}

class _AuthGateState extends State<AuthGate> {
  late bool _signedIn;
  int _lastSeenSignal = SessionEvents.unauthorized.value;

  @override
  void initState() {
    super.initState();
    _signedIn = widget.isLoggedIn;
    SessionEvents.unauthorized.addListener(_onUnauthorized);
  }

  @override
  void dispose() {
    SessionEvents.unauthorized.removeListener(_onUnauthorized);
    super.dispose();
  }

  void _onUnauthorized() {
    if (SessionEvents.unauthorized.value == _lastSeenSignal) return;
    _lastSeenSignal = SessionEvents.unauthorized.value;
    if (!mounted || !_signedIn) return;

    setState(() => _signedIn = false);
    // Deferred so the frame that swaps in the login screen has been built before
    // the message lands on it.
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Your session expired. Please sign in again.')),
      );
    });
  }

  @override
  Widget build(BuildContext context) {
    return _signedIn ? const MainShell() : const LoginScreen();
  }
}
