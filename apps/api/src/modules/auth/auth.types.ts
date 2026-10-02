/**
 * Identidad que viaja en el JWT de **atiende**.
 *
 * El harness no tiene login propio: valida el token que ya emite atiende (mismo
 * `JWT_SECRET` en el server), así que una sola sesión sirve para todo el
 * ecosistema. Estos son los claims que firma atiende:
 *
 *  - `sub`        → id del usuario. Es el DUEÑO de los archivos y trabajos.
 *  - `email`      → para mostrar y auditar.
 *  - `businessId` → organización (tenant), para agrupar.
 *  - `role`       → `ADMIN` | `SUPER_ADMIN`. Solo `SUPER_ADMIN` ve todo.
 */
export interface AuthPayload {
  sub: string;
  email?: string;
  businessId?: string;
  role?: string;
}

/** Request con el usuario ya resuelto por el guard. */
export interface RequestWithAuth {
  auth?: AuthPayload;
}
