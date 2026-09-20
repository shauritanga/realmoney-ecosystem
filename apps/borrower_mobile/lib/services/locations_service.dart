import 'dart:convert';
import 'package:flutter/services.dart' show rootBundle;
import 'api_service.dart';

class LocationsService {
  static Map<String, Map<String, List<String>>>? _hierarchy;
  static Future<Map<String, Map<String, List<String>>>>? _loadFuture;

  static Future<Map<String, Map<String, List<String>>>> load() {
    if (_hierarchy != null) return Future.value(_hierarchy!);
    _loadFuture ??= _doLoad();
    return _loadFuture!;
  }

  static Future<Map<String, Map<String, List<String>>>> _doLoad() async {
    try {
      // 1. Try loading from bundled assets (instant and offline)
      try {
        final jsonString = await rootBundle.loadString('assets/data/tanzania-locations.json');
        final raw = jsonDecode(jsonString) as Map<String, dynamic>;
        _hierarchy = _parseHierarchy(raw);
        return _hierarchy!;
      } catch (_) {
        // Fall back to API
      }

      // 2. Fetch from backend API
      try {
        final res = await ApiService.request('/locations/hierarchy', authenticated: false);
        _hierarchy = _parseHierarchy(res);
        return _hierarchy!;
      } catch (_) {
        // Fallback to empty if all fails
      }
    } finally {
      _hierarchy ??= {};
    }
    return _hierarchy!;
  }

  static Map<String, Map<String, List<String>>> _parseHierarchy(Map<String, dynamic> raw) {
    final result = <String, Map<String, List<String>>>{};
    for (final regionEntry in raw.entries) {
      final regionName = regionEntry.key.toString();
      final districtsMap = <String, List<String>>{};
      if (regionEntry.value is Map) {
        for (final districtEntry in (regionEntry.value as Map).entries) {
          final districtName = districtEntry.key.toString();
          final wards = <String>[];
          if (districtEntry.value is List) {
            for (final w in (districtEntry.value as List)) {
              wards.add(w.toString());
            }
          }
          wards.sort((a, b) => a.toLowerCase().compareTo(b.toLowerCase()));
          districtsMap[districtName] = wards;
        }
      }
      result[regionName] = districtsMap;
    }
    return result;
  }

  static List<String> getRegions([Map<String, Map<String, List<String>>>? data]) {
    final h = data ?? _hierarchy;
    if (h == null) return [];
    final list = h.keys.toList();
    list.sort((a, b) => a.toLowerCase().compareTo(b.toLowerCase()));
    return list;
  }

  static List<String> getDistricts(String region, [Map<String, Map<String, List<String>>>? data]) {
    final h = data ?? _hierarchy;
    if (h == null || !h.containsKey(region)) return [];
    final list = h[region]!.keys.toList();
    list.sort((a, b) => a.toLowerCase().compareTo(b.toLowerCase()));
    return list;
  }

  static List<String> getWards(String region, String district, [Map<String, Map<String, List<String>>>? data]) {
    final h = data ?? _hierarchy;
    if (h == null || !h.containsKey(region)) return [];
    final districts = h[region]!;
    if (!districts.containsKey(district)) return [];
    final list = List<String>.from(districts[district]!);
    list.sort((a, b) => a.toLowerCase().compareTo(b.toLowerCase()));
    return list;
  }
}
