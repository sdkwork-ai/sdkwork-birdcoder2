export interface SdkWorkApiResponse {
  code: 0;
  /** Operation-specific payload typed per response schema. */
  data: unknown;
  /** Server-owned request correlation id. */
  traceId: string;
}
