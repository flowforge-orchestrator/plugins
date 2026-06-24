import { FieldDecorator } from '@kosolapus/plugin-ts-sdk';

/** Статические поля подключения к CalDAV-серверу. */
export class CaldavConnectionDto {
  @FieldDecorator({
    label: 'CalDAV URL',
    description:
      'Базовый URL сервера (например https://nextcloud.example.com/remote.php/dav)',
    type: 'string',
    required: true,
    static: true,
  })
  caldavUrl!: string;

  @FieldDecorator({
    label: 'Логин',
    description: 'Имя пользователя CalDAV',
    type: 'string',
    required: true,
    static: true,
  })
  username!: string;

  @FieldDecorator({
    label: 'Пароль',
    description: 'Пароль или app-password',
    type: 'ref',
    required: true,
    static: true,
  })
  password!: string;
}
