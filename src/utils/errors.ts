import type { StatusCodes } from 'http-status-codes';

interface CodedErrorForResponse {
  message: string;
  code?: string;
}

type StatusCodeNumber = (typeof StatusCodes)[keyof typeof StatusCodes];

export class UpstreamResponseError extends Error {
  constructor(
    public status: number,
    public body: object
  ) {
    super('The upstream request failed.');
  }
}

export class CodedError extends Error {
  constructor(
    public code: StatusCodeNumber,
    message: string,
    public errorCode?: string
  ) {
    super(message);
  }

  buildResponse() {
    const res: CodedErrorForResponse = { message: this.message };
    if (this.errorCode) res.code = this.errorCode;

    return res;
  }
}
