import type { CaldavConnectionConfig } from './caldav-types';

function readRequiredString(
  inputs: Record<string, unknown>,
  key: keyof CaldavConnectionConfig,
  label: string,
): string {
  const raw = inputs[key];
  if (typeof raw === 'string' && raw.trim()) {
    return raw.trim();
  }
  if (typeof raw === 'number' || typeof raw === 'boolean') {
    return String(raw);
  }
  throw new Error(
    `Не задано поле «${label}» (${String(key)}). Укажите его в настройках узла (static).`,
  );
}

export function resolveCaldavConfig(
  inputs: Record<string, unknown>,
): CaldavConnectionConfig {
  return {
    caldavUrl: readRequiredString(inputs, 'caldavUrl', 'CalDAV URL'),
    username: readRequiredString(inputs, 'username', 'Логин'),
    password: readRequiredString(inputs, 'password', 'Пароль'),
  };
}
