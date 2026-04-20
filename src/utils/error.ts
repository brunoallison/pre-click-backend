export class HttpErrorBase extends Error {
  public readonly status: number;
  public readonly code: string;
  public readonly context?: Record<string, unknown>;

  constructor(status: number, code: string, message: string, context?: Record<string, unknown>) {
    super(message);
    this.status = status;
    this.code = code;
    this.context = context;
  }
}

function make(status: number) {
  return (code: string, message?: string, context?: Record<string, unknown>) =>
    new HttpErrorBase(status, code, message ?? code, context);
}

export const HttpError = {
  BadRequest: make(400),
  Unauthorized: make(401),
  Forbidden: make(403),
  NotFound: make(404),
  Conflict: make(409),
  Unprocessable: make(422),
  TooMany: make(429),
  Internal: make(500),
};
