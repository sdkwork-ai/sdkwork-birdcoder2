// SDKWORK-TLS-TRUST-TEMPLATE-TEST v1
//
// Canonical regression test for the vendored HTTPS trust layer.
//
// Generated from `sdkwork-specs/templates/flutter/sdkwork_tls_trust_test.dart`
// and vendored at `test/bootstrap/sdkwork_tls_trust_test.dart`. Do not edit a
// vendored copy: change the template and re-run
// `node <sdkwork-specs>/tools/check-flutter-tls-trust.mjs --workspace <workspace> --fix`.

// `lib/` is imported relatively so the vendored copy stays identical in every
// application package regardless of its package name.
// ignore_for_file: avoid_relative_lib_imports

import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

import '../../lib/bootstrap/sdkwork_tls_trust.dart';

void main() {
  tearDown(() {
    HttpOverrides.global = null;
  });

  group('mode resolution', () {
    test('debug builds default to scoped self-signed trust', () {
      final config = SdkworkTlsTrustConfig.fromEnvironment(
        isReleaseMode: false,
        environment: const <String, String>{},
      );
      expect(config.mode, SdkworkTlsTrustMode.insecureDev);
      expect(config.allowsUntrustedCertificate, isTrue);
    });

    test('release builds are strict even when the environment asks otherwise',
        () {
      final config = SdkworkTlsTrustConfig.fromEnvironment(
        isReleaseMode: true,
        environment: const <String, String>{
          'SDKWORK_TLS_TRUST_MODE': 'insecure-dev',
          'SDKWORK_TLS_TRUST_HOSTS': 'api-dev.sdkwork.com',
        },
      );
      expect(config.mode, SdkworkTlsTrustMode.strict);
      expect(config.allowsUntrustedCertificate, isFalse);
      expect(config.warnings, isNotEmpty);
    });

    test('strict mode is honoured in debug builds', () {
      final config = SdkworkTlsTrustConfig.fromEnvironment(
        isReleaseMode: false,
        environment: const <String, String>{'SDKWORK_TLS_TRUST_MODE': 'strict'},
      );
      expect(config.mode, SdkworkTlsTrustMode.strict);
      expect(config.allowsUntrustedCertificate, isFalse);
    });

    test('unknown modes fall back with a warning', () {
      final config = SdkworkTlsTrustConfig.fromEnvironment(
        isReleaseMode: false,
        environment: const <String, String>{'SDKWORK_TLS_TRUST_MODE': 'wat'},
      );
      expect(config.mode, SdkworkTlsTrustMode.insecureDev);
      expect(config.warnings, isNotEmpty);
    });
  });

  group('host allowlist', () {
    test('exact, wildcard, and case-insensitive matching', () {
      final config = SdkworkTlsTrustConfig.fromEnvironment(
        isReleaseMode: false,
        environment: const <String, String>{
          'SDKWORK_TLS_TRUST_HOSTS': 'api-dev.sdkwork.com,*.local.test',
        },
      );
      expect(config.isHostAllowed('api-dev.sdkwork.com'), isTrue);
      expect(config.isHostAllowed('API-DEV.SDKWORK.COM'), isTrue);
      expect(config.isHostAllowed('edge.local.test'), isTrue);
      expect(config.isHostAllowed('a.b.local.test'), isTrue);
      expect(config.isHostAllowed('sdkwork.com'), isFalse);
      expect(config.isHostAllowed('evil.test'), isFalse);
    });

    test('an empty allowlist trusts every host', () {
      final config = SdkworkTlsTrustConfig.fromEnvironment(
        isReleaseMode: false,
        environment: const <String, String>{},
      );
      expect(config.allowedHosts, isEmpty);
      expect(config.isHostAllowed('anything.example'), isTrue);
    });

    test('a wildcard does not match the bare parent domain', () {
      final config = SdkworkTlsTrustConfig.fromEnvironment(
        isReleaseMode: false,
        environment: const <String, String>{
          'SDKWORK_TLS_TRUST_HOSTS': '*.sdkwork.com',
        },
      );
      expect(config.isHostAllowed('api-dev.sdkwork.com'), isTrue);
      expect(config.isHostAllowed('sdkwork.com'), isFalse);
    });
  });

  group('additional CA bundle', () {
    test('a PEM bundle is accepted', () {
      final config = SdkworkTlsTrustConfig.fromEnvironment(
        isReleaseMode: true,
        environment: const <String, String>{
          'SDKWORK_TLS_TRUST_CA_PEM':
              '-----BEGIN CERTIFICATE-----\nMIIB\n-----END CERTIFICATE-----',
        },
      );
      expect(config.extraCaPem, isNotNull);
      expect(config.warnings, isEmpty);
    });

    test('a non-PEM value is rejected with a warning', () {
      final config = SdkworkTlsTrustConfig.fromEnvironment(
        isReleaseMode: true,
        environment: const <String, String>{
          'SDKWORK_TLS_TRUST_CA_PEM': 'not-a-certificate',
        },
      );
      expect(config.extraCaPem, isNull);
      expect(config.warnings, isNotEmpty);
    });
  });

  group('installation', () {
    test('install publishes the process-wide overrides', () {
      final config = SdkworkTlsTrustConfig.fromEnvironment(
        isReleaseMode: false,
        environment: const <String, String>{
          'SDKWORK_TLS_TRUST_HOSTS': 'api-dev.sdkwork.com',
        },
      );
      SdkworkTlsTrust.install(config);
      expect(SdkworkTlsTrust.installed, same(config));
      expect(HttpOverrides.current, isNotNull);
      expect(SdkworkTlsTrust.installed!.isHostAllowed('api-dev.sdkwork.com'),
          isTrue);
    });
  });
}
