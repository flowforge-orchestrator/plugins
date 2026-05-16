import { IsOptional, IsString } from 'class-validator';
import {
  ExecContext,
  Executor,
  FieldDecorator,
  loadHelpFromFile,
} from '@kosolapus/plugin-ts-sdk';
import { publicationPullEndpointFromEnv } from '../getUrlFromEnv';
import { MailerService, SendEmailPayload } from './mailer.service';

class OutputDto {
  @IsString()
  @FieldDecorator({
    type: 'string',
    label: 'Результат',
    description: 'Статус отправки письма',
  })
  result!: string;
}

class InputDto {
  @IsString()
  @FieldDecorator({
    type: 'string',
    label: 'Тема',
    description: 'Тема письма',
  })
  subject!: string;

  @IsString()
  @FieldDecorator({
    type: 'string',
    label: 'Кому',
    description: 'Адрес получателя',
  })
  to!: string;

  @IsString()
  @IsOptional()
  @FieldDecorator({
    type: 'string',
    label: 'Текст',
    description: 'Текстовая версия письма (plain text)',
  })
  text?: string;

  @IsString()
  @IsOptional()
  @FieldDecorator({
    type: 'string',
    label: 'Вложение: путь',
    description: 'Опционально: путь к файлу для отправки во вложении',
    isPort: true,
    canBePort: true,
  })
  attachmentPath?: string;

  @IsString()
  @IsOptional()
  @FieldDecorator({
    type: 'string',
    label: 'Вложение: имя файла',
    description:
      'Опционально: имя вложения в письме (для пути или для одного inline)',
    isPort: true,
    canBePort: true,
  })
  attachmentFilename?: string;

  @IsOptional()
  @FieldDecorator({
    type: 'keyvalue',
    label: 'Вложение (inline)',
    description:
      'Один файл из readBinary/xlsx: { filename?, base64 }. Или массив таких объектов в поле attachments.',
    isPort: true,
    canBePort: true,
  })
  attachment?: { filename?: string; base64?: string };

  @IsOptional()
  @FieldDecorator({
    type: 'keyvalue',
    label: 'Вложения (массив)',
    description:
      'Массив { filename?, base64 } из readBinary/xlsx. Можно подключить выход xlsx base64.',
    isPort: true,
    canBePort: true,
  })
  attachments?: { filename?: string; base64?: string }[];

  @IsString()
  @FieldDecorator({
    type: 'string',
    label: 'Содержимое',
    description: 'HTML-содержимое письма',
  })
  body!: string;

  @IsString()
  @FieldDecorator({
    type: 'string',
    label: 'SMTP хост',
    description: 'Адрес SMTP-сервера',
    static: true,
  })
  host!: string;

  @IsString()
  @FieldDecorator({
    type: 'string',
    label: 'SMTP порт',
    description: 'Порт SMTP-сервера',
    static: true,
  })
  port!: number;

  @IsString()
  @FieldDecorator({
    type: 'boolean',
    label: 'SSL/TLS',
    description: 'Использовать защищённое соединение',
    static: true,
  })
  secure!: boolean;

  @IsString()
  @IsOptional()
  @FieldDecorator({
    type: 'string',
    label: 'Логин',
    description: 'Логин для SMTP-авторизации',
    static: true,
  })
  user?: string;

  @IsString()
  @IsOptional()
  @FieldDecorator({
    type: 'ref',
    label: 'Пароль',
    description: 'Пароль для SMTP (ссылка на секрет)',
    static: true,
  })
  pass?: string;

  @IsString()
  @FieldDecorator({
    type: 'string',
    label: 'От кого (From)',
    description: 'Адрес отправителя письма',
    static: true,
  })
  from!: string;
}

@Executor<InputDto, OutputDto>({
  name: 'Отправка электронной почты',
  description:
    'Отправляет письмо через SMTP. Требует настройки сервера (хост, порт).',
  nodeType: 'data.email.send',
  help: loadHelpFromFile(__dirname),
  outputs: OutputDto,
  inputs: InputDto,
  transport: {
    type: 'tcp',
    params: publicationPullEndpointFromEnv(),
  },
})
export class DataEmailSendExecutor {
  async execute(ctx: ExecContext<InputDto>): Promise<OutputDto> {
    const {
      subject,
      body,
      to,
      text,
      attachmentPath,
      attachmentFilename,
      attachment,
      attachments,
    } = ctx.inputs;
    const { host, port, secure, user, pass, from: fromAddr } = ctx.inputs;
    const payload: SendEmailPayload = {
      to,
      subject,
      text,
      html: body,
      attachmentPath,
      attachmentFilename,
      attachment: attachment as
        | { filename: string; base64: string }
        | undefined,
      attachments: attachments as
        | { filename: string; base64: string }[]
        | undefined,
      from: fromAddr,
    };
    const mailer = new MailerService();
    await mailer.sendEmail(payload, { host, port, secure, user, pass });
    return Promise.resolve({
      result: 'Ok',
    });
  }
}
