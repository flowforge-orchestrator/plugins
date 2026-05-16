// executors/jira/get-issues.dto.ts

// Входные параметры шага
import { FieldDecorator } from '@kosolapus/plugin-ts-sdk';
import { Issue } from '../../../types/issue';

export class GetIssuesInputDto {
  @FieldDecorator({
    label: 'Статусы',
    description: 'Фильтр по статусам задач',
    type: 'select',
    required: false,
  })
  statuses?: string[];

  @FieldDecorator({
    label: 'Максимальное количество',
    description: 'Количество задач, которые вернёт шаг',
    type: 'number',
    required: false,
    default: 50,
  })
  maxResults?: number;

  @FieldDecorator({
    label: 'Только активные',
    description: 'Фильтровать задачи, которые не в Done',
    type: 'boolean',
    required: false,
    default: true,
  })
  onlyActive?: boolean;

  @FieldDecorator({
    label: 'Тип задачи',
    description: 'Тип задачи в Jira (например Test, Bug и т.д.)',
    type: 'string',
    required: false,
  })
  type?: string;

  @FieldDecorator({
    label: 'Поля',
    description: 'Список полей, которые нужно получить из Jira',
    type: 'keyvalue',
    required: false,
  })
  fields?: string[];
}

// Выходные данные шага
export class GetIssuesOutputDto {
  @FieldDecorator({
    label: 'Список задач',
    description: 'Возвращаемый массив задач',
    type: 'ref', // это ссылка на коллекцию
    required: true,
    static: false,
  })
  issues!: Issue[];

  @FieldDecorator({
    label: 'Общее количество',
    description: 'Общее количество задач по запросу',
    type: 'number',
    required: false,
  })
  total?: number;
}

// Конфигурация (секреты и адрес сервера)
export class GetIssuesStepDto extends GetIssuesInputDto {
  @FieldDecorator({
    label: 'URL Jira',
    description: 'Базовый URL Jira сервера',
    type: 'string',
    required: true,
    static: true,
  })
  baseUrl!: string;

  @FieldDecorator({
    label: 'API токен',
    description: 'Токен доступа к Jira',
    type: 'ref',
    required: true,
    static: true,
  })
  token!: string;
}
