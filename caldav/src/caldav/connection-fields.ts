import { IsString, MinLength } from 'class-validator';
import { FieldDecorator } from '@kosolapus/plugin-ts-sdk';

/**
 * Поля подключения CalDAV — объявляйте на том же классе, что передаётся в @Executor({ inputs }).
 * (Метаданные FieldDecorator не наследуются с базового класса.)
 */
export function declareCaldavConnectionFields(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  target: any,
  key: 'caldavUrl' | 'username' | 'password',
): void {
  if (key === 'caldavUrl') {
    IsString()(target, 'caldavUrl');
    MinLength(1)(target, 'caldavUrl');
    FieldDecorator({
      type: 'string',
      label: 'CalDAV URL',
      description:
        'Базовый URL сервера (например https://cloud.example.com/remote.php/dav)',
      required: true,
      static: true,
    })(target, 'caldavUrl');
    return;
  }
  if (key === 'username') {
    IsString()(target, 'username');
    MinLength(1)(target, 'username');
    FieldDecorator({
      type: 'string',
      label: 'Логин',
      description: 'Имя пользователя CalDAV',
      required: true,
      static: true,
    })(target, 'username');
    return;
  }
  IsString()(target, 'password');
  MinLength(1)(target, 'password');
  FieldDecorator({
    type: 'ref',
    label: 'Пароль',
    description: 'Пароль или app-password CalDAV',
    required: true,
    static: true,
  })(target, 'password');
}
