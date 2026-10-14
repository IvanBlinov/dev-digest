/** Edge errors: what can go wrong talking to the DevDigest HTTP API. Data only. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export class ApiUnreachableError extends Error {
  constructor(readonly url: string) {
    super(`DevDigest API unreachable at ${url}`);
    this.name = 'ApiUnreachableError';
  }
}

export class ApiTimeoutError extends Error {
  constructor(readonly timeoutMs: number) {
    super(`DevDigest API did not answer within ${timeoutMs}ms`);
    this.name = 'ApiTimeoutError';
  }
}
