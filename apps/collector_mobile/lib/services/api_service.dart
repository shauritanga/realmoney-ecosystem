import 'dart:convert';
import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';
import '../models/loan_assignment.dart';

class ApiService {
  // Use localhost for web/desktop, 10.0.2.2 for Android emulator
  static String get baseUrl {
    if (kIsWeb) {
      return 'http://localhost:3001/api/v1';
    }
    // Default to localhost for desktop/Linux/macOS or emulator
    return 'http://localhost:3001/api/v1';
  }

  static Future<String?> getToken() async {
    final prefs = await SharedPreferences.getInstance();
    return prefs.getString('auth_token');
  }

  static Future<void> saveToken(String token) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString('auth_token', token);
  }

  static Future<void> clearToken() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove('auth_token');
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

  static Future<List<LoanAssignment>> fetchMyQueue({String? level}) async {
    final token = await getToken();
    final url = level == null
        ? '$baseUrl/collections/my-queue'
        : '$baseUrl/collections/my-queue?level=$level';
    final response = await http.get(
      Uri.parse(url),
      headers: {
        'Authorization': 'Bearer $token',
        'Content-Type': 'application/json',
      },
    );

    if (response.statusCode == 200) {
      final List<dynamic> list = jsonDecode(response.body);
      return list.map((item) => LoanAssignment.fromJson(item)).toList();
    } else {
      throw Exception('Failed to load collection queue');
    }
  }

  static Future<Map<String, dynamic>> fetchStats() async {
    final token = await getToken();
    final response = await http.get(
      Uri.parse('$baseUrl/collections/stats'),
      headers: {
        'Authorization': 'Bearer $token',
        'Content-Type': 'application/json',
      },
    );

    if (response.statusCode == 200) {
      return jsonDecode(response.body);
    }
    return {};
  }

  static Future<bool> logInteraction({
    required String loanId,
    required String channel,
    required String disposition,
    String? notes,
    double? ptpAmount,
    String? ptpDate,
  }) async {
    final token = await getToken();
    final response = await http.post(
      Uri.parse('$baseUrl/collections/log-interaction'),
      headers: {
        'Authorization': 'Bearer $token',
        'Content-Type': 'application/json',
      },
      body: jsonEncode({
        'loanId': loanId,
        'channel': channel,
        'disposition': disposition,
        'notes': notes,
        'ptpAmount': ptpAmount,
        'ptpDate': ptpDate,
      }),
    );

    return response.statusCode == 200 || response.statusCode == 201;
  }

  static Future<Map<String, dynamic>> triggerPaymentPrompt({
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
