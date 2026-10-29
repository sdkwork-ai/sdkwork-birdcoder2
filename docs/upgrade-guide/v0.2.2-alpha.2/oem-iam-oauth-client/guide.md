---
kind: upgrade-guide
description: "The desktop browser login now presents OAuth client `birdcoder` and returns through `birdcoder://auth/callback` instead of the retired `sdkwork-birdcoder` identities."
---
# Desktop browser login uses the birdcoder OAuth client and deep link

English | [中文](guide.zh.md)

## Change

The hosted SDKWork IAM browser login used to send `client_id` = the `ui-sdkwork-env` app id (`sdkwork-birdcoder`) and derive its redirect from that id as `sdkwork-birdcoder://auth/callback`. It now sends the OEM profile's `sdkwork.iamClientId` and `sdkwork.iamRedirectUri`, which ship as `birdcoder` and `birdcoder://auth/callback`.

The API tenant identity does not move: `ui-sdkwork-env`'s `appId` still identifies API requests. Only the OAuth client and its callback change, because the authorization server validates both against the tenant application's registered relying party.

The desktop shell now accepts a deep link only when its scheme, authority, and path equal the registered callback. The product link `birdcoder://open` and the retired `sdkwork-birdcoder` scheme no longer enter the login flow.

## Migration

1. In the SDKWork IAM console, register `birdcoder://auth/callback` as the desktop redirect of the public OAuth client `birdcoder` for the tenant that serves this deployment.
2. To keep the identity already registered instead, set `sdkwork.iamClientId` and `sdkwork.iamRedirectUri` in `$DSH_HOME/oem.json`, or in the packaged `resources/oem.json`, before launching this build.
3. OEM brands whose `brands/<key>.json` changes `desktop.protocol` must set `sdkwork.iamRedirectUri` to that scheme: the packaged shell registers it with the operating system, and a redirect on another scheme never reaches the application.
4. Start the desktop application, choose browser sign-in, and confirm the hosted page opens and returns through the registered callback into a signed-in session. A rejected callback leaves the sign-in surface in its failed state, so a retry that still fails means the console registration and the profile disagree.
