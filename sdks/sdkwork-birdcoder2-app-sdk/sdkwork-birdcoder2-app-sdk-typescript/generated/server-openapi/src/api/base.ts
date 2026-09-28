import type { QueryParams } from '../types/common';
import type { HttpClient } from '../http/client';

export abstract class BaseApi {
  constructor(
    protected http: HttpClient,
    protected basePath: string
  ) {}

  protected async get<T>(path: string, params?: QueryParams, headers?: Record<string, string>): Promise<T> {
    return this.http.get<T>(`${this.basePath}${path}`, params, headers);
  }

  protected async post<T>(
    path: string,
    body?: unknown,
    params?: QueryParams,
    headers?: Record<string, string>,
    contentType?: string,
  ): Promise<T> {
    return this.http.post<T>(`${this.basePath}${path}`, body, params, headers, contentType);
  }

  protected async put<T>(
    path: string,
    body?: unknown,
    params?: QueryParams,
    headers?: Record<string, string>,
    contentType?: string,
  ): Promise<T> {
    return this.http.put<T>(`${this.basePath}${path}`, body, params, headers, contentType);
  }

  protected async delete<T>(path: string, params?: QueryParams, headers?: Record<string, string>): Promise<T> {
    return this.http.delete<T>(`${this.basePath}${path}`, params, headers);
  }

  protected async patch<T>(
    path: string,
    body?: unknown,
    params?: QueryParams,
    headers?: Record<string, string>,
    contentType?: string,
  ): Promise<T> {
    return this.http.patch<T>(`${this.basePath}${path}`, body, params, headers, contentType);
  }

  protected async request<T>(
    method: string,
    path: string,
    body?: unknown,
    params?: QueryParams,
    headers?: Record<string, string>,
    contentType?: string,
  ): Promise<T> {
    return this.http.request<T>(`${this.basePath}${path}`, {
      method: method as any,
      ...(body !== undefined ? { body } : {}),
      ...(params !== undefined ? { params } : {}),
      ...(headers !== undefined ? { headers } : {}),
      ...(contentType !== undefined ? { contentType } : {}),
    });
  }
}
