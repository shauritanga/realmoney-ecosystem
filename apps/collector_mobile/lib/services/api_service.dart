import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';

import '../models/interaction_log.dart';
import '../models/loan_assignment.dart';

/// Raised when the API rejects a request, carrying the server's own message so the
/// collector sees why rather than a generic failure.
class ApiException implements Exception {
  final int statusCode;
  final String message;
  const ApiException(this.statusCode, this.message);
  @override
  String toString() => message;
}

/// Notifies the app that the session is gone.
///
/// Previously an expired token just made every fetch throw "Failed to load queue"
/// forever, with no way back to the login screen short of reinstalling.
class SessionEvents {
  static final ValueNotifier<int> unauthorized = ValueNotifier<int>(0);
  static void signalExpired() => unauthorized.value++;
}

class ApiService {
  static String get baseUrl {
    return const String.fromEnvironment(
      'API_BASE_URL',
      defaultValue: 'https://money-api.zanua.co.tz/api/v1',
    );
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

  /// Single path for every authenticated call, so token handling, decoding and the
  /// 401 response are defined once instead of per method.
  static Future<dynamic> _send(
    String method,
    String path, {
    Map<String, dynamic>? body,
  }) async {
    final token = await getToken();
    final uri = Uri.parse('$baseUrl$path');
    final headers = {
      'Authorization': 'Bearer $token',
      'Content-Type': 'application/json',
    };

    late http.Response response;
    try {
      response = switch (method) {
        'POST' => await http.post(uri, headers: headers, body: jsonEncode(body ?? {})),
        _ => await http.get(uri, headers: headers),
      };
    } catch (error) {
      throw ApiException(0, 'No connection. Check your network and try again.');
    }

    if (response.statusCode == 401) {
      await clearToken();
      SessionEvents.signalExpired();
      throw const ApiException(401, 'Your session expired. Please sign in again.');
    }

    // An error page or an empty body must not crash the parse.
    dynamic data;
    if (response.body.isNotEmpty) {
      try {
        data = jsonDecode(response.body);
      } catch (_) {
        data = null;
      }
    }

    if (response.statusCode >= 200 && response.statusCode < 300) return data;

    final message = data is Map && data['message'] != null
        // Nest returns a list of messages when class-validator rejects a field.
        ? (data['message'] is List
            ? (data['message'] as List).join(' ')
            : data['message'].toString())
        : 'Request failed (${response.statusCode}).';
    throw ApiException(response.statusCode, message);
  }

  static Future<Map<String, dynamic>> login(String identifier, String password) async {
    final response = await http.post(
      Uri.parse('$baseUrl/auth/login'),
      headers: {'Content-Type': 'application/json'},
      body: jsonEncode({'identifier': identifier, 'password': password}),
    );

    final data = jsonDecode(response.body);
    if (response.statusCode == 200 || response.statusCode == 201) {
      await saveToken(data['accessToken'] as String);
      return {'success': true, 'user': data['user']};
    }
    return {'success': false, 'message': data['message'] ?? 'Login failed'};
  }

  static Future<List<LoanAssignment>> fetchMyQueue({String? level}) async {
    final query = level == null ? '' : '?level=$level';
    final data = await _send('GET', '/collections/my-queue$query');
    if (data is! List) throw const ApiException(0, 'Unexpected queue response.');
    return data
        .map((item) => LoanAssignment.fromJson(item as Map<String, dynamic>))
        .toList();
  }

  static Future<Map<String, dynamic>> fetchStats() async {
    try {
      final data = await _send('GET', '/collections/stats');
      return data is Map<String, dynamic> ? data : {};
    } on ApiException catch (error) {
      // Stats are decoration; a failure here must not empty the work queue. A 401
      // still has to propagate so the session can be reset.
      if (error.statusCode == 401) rethrow;
      return {};
    }
  }

  /// One case, refreshed. The app used to re-fetch the entire queue and pick itself
  /// out of it to update a single screen.
  static Future<Map<String, dynamic>> fetchCase(String loanId) async {
    final data = await _send('GET', '/collections/cases/$loanId');
    if (data is! Map<String, dynamic>) {
      throw const ApiException(0, 'Unexpected case response.');
    }
    return data;
  }

  /// A page of a case's contact history, newest first.
  static Future<({List<InteractionLog> items, String? nextCursor})> fetchCaseHistory(
    String loanId, {
    int limit = 25,
    String? before,
  }) async {
    final cursor = before == null ? '' : '&before=${Uri.encodeComponent(before)}';
    final data = await _send(
      'GET',
      '/collections/cases/$loanId/interactions?limit=$limit$cursor',
    );
    final items = (data?['items'] as List? ?? [])
        .map((item) => InteractionLog.fromJson(item as Map<String, dynamic>))
        .toList();
    return (items: items, nextCursor: data?['nextCursor'] as String?);
  }

  /// The signed-in collector's profile.
  static Future<Map<String, dynamic>> fetchMe() async {
    final data = await _send('GET', '/auth/me');
    return data is Map<String, dynamic> ? data : {};
  }

  /// Every promise this collector has secured, plus a tally by state.
  static Future<Map<String, dynamic>> fetchMyPromises({String? status}) async {
    final query = status == null ? '' : '?status=$status';
    final data = await _send('GET', '/collections/promises$query');
    return data is Map<String, dynamic> ? data : {};
  }

  /// This collector's own performance over a date range.
  static Future<Map<String, dynamic>> fetchMyPerformance({
    String? from,
    String? to,
  }) async {
    final params = <String>[
      if (from != null) 'from=$from',
      if (to != null) 'to=$to',
    ];
    final query = params.isEmpty ? '' : '?${params.join('&')}';
    final data = await _send('GET', '/collections/me/performance$query');
    return data is Map<String, dynamic> ? data : {};
  }

  static Future<Map<String, dynamic>> fetchFollowUps({String? on}) async {
    final query = on == null ? '' : '?on=$on';
    final data = await _send('GET', '/collections/follow-ups$query');
    return data is Map<String, dynamic> ? data : {};
  }

  /// Records a contact attempt and what the customer said.
  ///
  /// `clientRef` makes a retry safe: the app is online-only and surfaces failures, so
  /// a collector whose submit times out will try again, and without this one call
  /// would be counted twice.
  static Future<Map<String, dynamic>> logInteraction({
    required String loanId,
    required String channel,
    required String disposition,
    required String clientRef,
    String? outcome,
    String? notes,
    int? durationSeconds,
    String? durationSource,
    String? callOutcome,
    String? followUpAt,
    double? ptpAmount,
    String? ptpDate,
  }) async {
    final data = await _send('POST', '/collections/log-interaction', body: {
      'loanId': loanId,
      'channel': channel,
      'disposition': disposition,
      'clientRef': clientRef,
      // Omit nulls rather than sending them: the DTO treats absent and null alike,
      // but an omitted key keeps the payload readable in server logs.
      'outcome': ?outcome,
      if (notes != null && notes.trim().isNotEmpty) 'notes': notes.trim(),
      'durationSeconds': ?durationSeconds,
      'durationSource': ?durationSource,
      'callOutcome': ?callOutcome,
      'followUpAt': ?followUpAt,
      'ptpAmount': ?ptpAmount,
      'ptpDate': ?ptpDate,
    });
    return data is Map<String, dynamic> ? data : {};
  }

  /// Prompts a phone to pay.
  ///
  /// [payerPhone] sends the prompt to someone other than the borrower -- a relative or
  /// friend settling on their behalf. It is recorded against the payment, not against
  /// the customer's profile.
  static Future<Map<String, dynamic>> triggerPaymentPrompt({
    required String loanId,
    required double amount,
    String? payerPhone,
    String? payerName,
  }) async {
    final data = await _send('POST', '/collections/trigger-payment', body: {
      'loanId': loanId,
      'amount': amount,
      'payerPhone': ?payerPhone,
      'payerName': ?payerName,
    });
    return data is Map<String, dynamic> ? data : {};
  }

  /// What an extension would cost right now. Read-only: nothing is charged.
  static Future<Map<String, dynamic>> extensionQuote(String loanId) async {
    final data = await _send('GET', '/collections/cases/$loanId/extension-quote');
    return data is Map<String, dynamic> ? data : {};
  }

  /// Offers an extension and pushes the fee for payment.
  ///
  /// The amount is deliberately not a parameter: the server prices the fee from the
  /// current balance, so a stale screen cannot sell an extension cheap.
  static Future<Map<String, dynamic>> extendLoan({
    required String loanId,
    String? payerPhone,
    String? payerName,
  }) async {
    final data = await _send('POST', '/collections/extend-loan', body: {
      'loanId': loanId,
      'payerPhone': ?payerPhone,
      'payerName': ?payerName,
    });
    return data is Map<String, dynamic> ? data : {};
  }
}
