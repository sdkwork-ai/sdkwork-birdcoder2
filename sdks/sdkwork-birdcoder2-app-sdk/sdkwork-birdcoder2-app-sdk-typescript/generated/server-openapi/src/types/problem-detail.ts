export interface ProblemDetail {
  type: string;
  title: string;
  status: number;
  detail?: string;
  instance?: string;
  code: number;
  /** Server-owned request correlation id. */
  traceId: string;
}
