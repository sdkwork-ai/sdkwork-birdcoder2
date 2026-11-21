import { appApiPath } from './paths';
import type { ApiRequestOptions, HttpClient } from '../http/client';

import type { InstallationApplication } from '../types';


export class InstallationApi {
  private client: HttpClient;

  constructor(client: HttpClient) {
    this.client = client;
  }


/** Get the caller's installation application */
  async retrieve(requestOptions?: ApiRequestOptions): Promise<InstallationApplication> {
    return this.client.request<InstallationApplication>(appApiPath(`/installation`), { ...(requestOptions?.signal !== undefined ? { signal: requestOptions.signal } : {}), ...(requestOptions?.timeout !== undefined ? { timeout: requestOptions.timeout } : {}), method: 'GET' as any, sdkworkUnwrapKind: 'item' });
  }
}

export function createInstallationApi(client: HttpClient): InstallationApi {
  return new InstallationApi(client);
}
