import { HttpClient, createHttpClient } from './http/client';
import type { SdkworkAppConfig } from './types/common';
import type { AuthTokenManager } from '@sdkwork/sdk-common';

import { HostsApi, createHostsApi } from './api/hosts';
import { AgentApi, createAgentApi } from './api/agent';

export class SdkworkBirdcoder2AppClient {
  private httpClient: HttpClient;

  public readonly hosts: HostsApi;
  public readonly agent: AgentApi;

  constructor(config: SdkworkAppConfig) {
    this.httpClient = createHttpClient(config);
    this.hosts = createHostsApi(this.httpClient);

    this.agent = createAgentApi(this.httpClient);
  }
  setAuthToken(token: string): this {
    this.httpClient.setAuthToken(token);
    return this;
  }

  setAccessToken(token: string): this {
    this.httpClient.setAccessToken(token);
    return this;
  }

  setTokenManager(manager: AuthTokenManager): this {
    this.httpClient.setTokenManager(manager);
    return this;
  }

  get http(): HttpClient {
    return this.httpClient;
  }
}

export function createClient(config: SdkworkAppConfig): SdkworkBirdcoder2AppClient {
  return new SdkworkBirdcoder2AppClient(config);
}

export default SdkworkBirdcoder2AppClient;
