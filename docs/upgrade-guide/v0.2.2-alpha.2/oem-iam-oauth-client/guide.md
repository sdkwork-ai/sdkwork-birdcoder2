---
kind: upgrade-guide
description: "The desktop browser login now presents OAuth client `birdcoder` and returns through `birdcoder://auth/callback` instead of the retired `sdkwork-birdcoder` identities."
---
# Desktop browser login uses the birdcoder OAuth client and deep link

English | [中文](guide.zh.md)

## Change

The hosted SDKWork IAM browser login used to send `client_id` = the `ui-sdkwork-env` app id (`sdkwork-birdcoder`) and derive its redirect from that id as `sdkwork-birdcoder://auth/callback`. It now sends the OEM profile's `sdkwork.iamClientId` and `sdkwork.iamRedirectUri`, which ship as `birdcoder` and `birdcoder://auth/callback` and follow the running brand: a launch that reports its `desktop.protocol` resolves `<scheme>` and `<scheme>://auth/callback` when the profile names neither, so a second brand built from these sources logs in without its own profile.

The API tenant identity does not move: `ui-sdkwork-env`'s `appId` still identifies API requests. Only the OAuth client and its callback change, because the authorization server validates both against the tenant application's registered relying party.

The desktop shell now accepts a deep link only when its scheme, authority, and path equal the registered callback. The product link `birdcoder://open` and the retired `sdkwork-birdcoder` scheme no longer enter the login flow. A profile that names another brand's client or callback fails the launch instead of leaving the sign-in surface to fail after the redirect.

## Migration

1. In the SDKWork IAM console, register `birdcoder://auth/callback` as the desktop redirect of the public OAuth client `birdcoder` for the tenant that serves this deployment.
2. To keep the identity already registered instead, set `sdkwork.iamClientId` and `sdkwork.iamRedirectUri` in `$DSH_HOME/oem.json`, or in the packaged `resources/oem.json`, before launching this build.
3. OEM brands whose `brands/<key>.json` changes `desktop.protocol` derive `sdkwork.iamClientId` and `sdkwork.iamRedirectUri` from that scheme; a profile that names them explicitly must use the same scheme. The packaged shell registers it with the operating system, and a redirect on another scheme never reaches the application.
4. Register the resulting client and callback for that brand's tenant in the SDKWork IAM console: `<scheme>` as a public client with `<scheme>://auth/callback` as its desktop redirect.
5. Start the desktop application, choose browser sign-in, and confirm the hosted page opens and returns through the registered callback into a signed-in session. A rejected callback leaves the sign-in surface in its failed state, so a retry that still fails means the console registration and the profile disagree.
