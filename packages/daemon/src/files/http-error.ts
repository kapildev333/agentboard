/** A client error: the server answers its status and message. */
export class HttpError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}
