import 'dart:convert';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';

class ApiService {
  static http.Client client = http.Client();
  static String get baseUrl => const String.fromEnvironment(
    'API_BASE_URL', defaultValue: 'http://localhost:3001/api/v1');

  static Future<Map<String, dynamic>> request(String path,
      {String method = 'GET', Map<String, dynamic>? body, bool authenticated = true}) async {
    final token = authenticated ? await getToken() : null;
    final headers = <String, String>{'Content-Type': 'application/json',
      if (token != null) 'Authorization': 'Bearer $token'};
    try {
      final uri = Uri.parse('$baseUrl$path');
      final response = await (method == 'GET' ? client.get(uri, headers: headers)
          : method == 'PUT' ? client.put(uri, headers: headers, body: jsonEncode(body))
          : client.post(uri, headers: headers, body: jsonEncode(body)))
          .timeout(const Duration(seconds: 30));
      final data = jsonDecode(response.body) as Map<String, dynamic>;
      if (response.statusCode < 200 || response.statusCode >= 300) {
        final message = data['message'];
        throw Exception(message is List ? message.join('\n') : message ?? 'Request failed. Please retry.');
      }
      return data;
    } on FormatException {
      throw Exception('The service returned an invalid response. Please retry.');
    }
  }

  static Future<Map<String, dynamic>> registerProfile(Map<String, dynamic> body,
      {bool existing = false}) async {
    final data = await request(existing ? '/onboarding/profile' : '/auth/register',
        method: existing ? 'PUT' : 'POST', body: body, authenticated: existing);
    if (!existing) await saveToken(data['accessToken'] as String);
    return data;
  }

  static Future<String?> getToken() async {
    final prefs = await SharedPreferences.getInstance();
    return prefs.getString('borrower_auth_token');
  }

  static Future<void> saveToken(String token) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString('borrower_auth_token', token);
  }

  static Future<void> clearToken() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove('borrower_auth_token');
  }

  static Future<Map<String, dynamic>> login(String identifier, String password) async {
    final response = await http.post(
      Uri.parse('$baseUrl/auth/login'),
      headers: {'Content-Type': 'application/json'},
      body: jsonEncode({
        'identifier': identifier,
        'password': password,
      }),
    );

    final data = jsonDecode(response.body);
    if (response.statusCode == 200 || response.statusCode == 201) {
      final token = data['accessToken'] as String;
      await saveToken(token);
      return {'success': true, 'user': data['user']};
    } else {
      return {'success': false, 'message': data['message'] ?? 'Login failed'};
    }
  }

  static Future<List<dynamic>> fetchProducts() async {
    final token = await getToken();
    final response = await http.get(
      Uri.parse('$baseUrl/loans/products'),
      headers: {
        'Authorization': 'Bearer $token',
        'Content-Type': 'application/json',
      },
    );

    if (response.statusCode == 200) {
      return jsonDecode(response.body);
    }
    return [];
  }

  static Future<Map<String, dynamic>> fetchBorrowingLimit() => request('/loans/my-limit');

  /// Uploads the FCM device token so the backend can push loan updates.
  /// Best-effort: never throws.
  static Future<void> registerPushToken(String token) async {
    try {
      await request('/notifications/token',
          method: 'POST', body: {'token': token, 'platform': 'android'});
    } catch (_) {}
  }

  /// Removes the FCM device token on logout. Best-effort: never throws.
  static Future<void> unregisterPushToken(String token) async {
    try {
      final authToken = await getToken();
      await client
          .delete(Uri.parse('$baseUrl/notifications/token'),
              headers: {
                'Authorization': 'Bearer $authToken',
                'Content-Type': 'application/json',
              },
              body: jsonEncode({'token': token}))
          .timeout(const Duration(seconds: 30));
    } catch (_) {}
  }

  static Future<List<dynamic>> fetchMyLoans() async {
    final token = await getToken();
    final response = await client.get(Uri.parse('$baseUrl/loans/my-loans'),
      headers: {'Authorization': 'Bearer $token'}).timeout(const Duration(seconds: 30));
    if (response.statusCode != 200) throw Exception('Could not load your loans. Please retry.');
    return jsonDecode(response.body) as List<dynamic>;
  }

  static Future<Map<String, dynamic>> applyForLoan({
    required String productId,
    required double principalAmount,
    required int tenureDays,
  }) async {
    final token = await getToken();
    final response = await http.post(
      Uri.parse('$baseUrl/loans/apply'),
      headers: {
        'Authorization': 'Bearer $token',
        'Content-Type': 'application/json',
      },
      body: jsonEncode({
        'productId': productId,
        'principalAmount': principalAmount,
        'tenureDays': tenureDays,
      }),
    );

    return jsonDecode(response.body);
  }

  /// Demo helper: simulates the borrower entering their mobile-money PIN,
  /// completing a previously triggered USSD push (backend simulate-callback).
  static Future<Map<String, dynamic>> simulatePinEntry({
    required String orderId,
    required double amount,
    bool success = true,
  }) async {
    final response = await http.post(
      Uri.parse('$baseUrl/selcom/simulate-callback'),
      headers: {'Content-Type': 'application/json'},
      body: jsonEncode({
        'orderId': orderId,
        'amount': amount,
        'success': success,
      }),
    );

    return jsonDecode(response.body);
  }

  static Future<Map<String, dynamic>> triggerSelfRepayment({
    required String loanId,
    required double amount,
  }) async {
    final token = await getToken();
    final response = await http.post(
      Uri.parse('$baseUrl/collections/trigger-payment'),
      headers: {
        'Authorization': 'Bearer $token',
        'Content-Type': 'application/json',
      },
      body: jsonEncode({
        'loanId': loanId,
        'amount': amount,
      }),
    );

    return jsonDecode(response.body);
  }
}
