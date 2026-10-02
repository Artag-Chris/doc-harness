/**
 * Errores tipados de la capa de IA. Se distinguen porque el llamador decide
 * distinto con cada uno:
 *  - `LlmHttpError`: el proveedor contestó mal (o no se llegó). Reintentable si
 *    el status es transitorio.
 *  - `LlmInvalidJsonError`: contestó bien pero NO cumplió el contrato de datos.
 *  - `LlmUnavailableError`: se agotaron los proveedores configurados.
 */

export class LlmHttpError extends Error {
  constructor(
    readonly provider: string,
    /** 0 = no hubo respuesta (red o tiempo agotado). */
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'LlmHttpError';
  }

  get isRetryable(): boolean {
    return (
      this.status === 0 ||
      this.status === 408 ||
      this.status === 409 ||
      this.status === 425 ||
      this.status === 429 ||
      this.status >= 500
    );
  }
}

export class LlmInvalidJsonError extends Error {
  constructor(
    readonly provider: string,
    message: string,
  ) {
    super(message);
    this.name = 'LlmInvalidJsonError';
  }
}

export class LlmUnavailableError extends Error {
  constructor(readonly reasons: string[]) {
    super(`Ningún proveedor de IA pudo responder:\n  - ${reasons.join('\n  - ')}`);
    this.name = 'LlmUnavailableError';
  }
}
