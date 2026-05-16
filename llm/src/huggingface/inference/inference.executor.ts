import { IsOptional, IsString, IsIn } from 'class-validator';
import { ExecContext, Executor, FieldDecorator, loadHelpFromFile } from '@kosolapus/plugin-ts-sdk';
import {
  textToSpeech as hfTextToSpeech,
  textToImage as hfTextToImage,
  textToVideo as hfTextToVideo,
  request as hfRequest,
  PROVIDERS_OR_POLICIES,
} from '@huggingface/inference';
import type { InferenceProviderOrPolicy } from '@huggingface/inference';
import { publicationPullEndpointFromEnv } from '../../getUrlFromEnv';

const TASKS = [
  'textToSpeech',
  'textToImage',
  'textToAudio',
  'textToVideo',
] as const;
const PROVIDER_VALUES = [...PROVIDERS_OR_POLICIES] as string[];

function blobToBase64(blob: Blob): Promise<string> {
  return blob.arrayBuffer().then((buf) => Buffer.from(buf).toString('base64'));
}

class InputDto {
  @IsString()
  @IsIn(TASKS)
  @FieldDecorator({
    type: 'string',
    label: 'Task',
    description:
      'Тип задачи: textToSpeech, textToImage, textToAudio, textToVideo',
    isPrimary: true,
    canBePort: true,
  })
  task!: (typeof TASKS)[number];

  @IsString()
  @FieldDecorator({
    type: 'string',
    label: 'Model',
    description: 'ID модели на Hugging Face Hub',
    canBePort: true,
    isPort: true,
  })
  model!: string;

  @IsString()
  @IsIn(PROVIDER_VALUES)
  @FieldDecorator({
    type: 'string',
    label: 'Provider',
    description:
      'Провайдер инференса: hf-inference (официальный HF), auto (автовыбор по модели), или сторонний (fal-ai, replicate и др.)',
    canBePort: true,
    isPort: false,
  })
  provider!: InferenceProviderOrPolicy;

  @FieldDecorator({
    type: 'string',
    label: 'Inputs',
    description:
      'Текст: для TTS/музыки — что озвучить/описание; для image — промпт',
    canBePort: true,
    isPort: true,
  })
  inputs!: string;

  @IsOptional()
  @IsString()
  @FieldDecorator({
    type: 'ref',
    label: 'Token',
    description: 'Ссылка на секрет с HF access token',
    isPort: false,
    canBePort: false,
    secretKind: 'HUGGINGFACE_TOKEN',
  })
  token?: string;
}

class OutputDto {
  @FieldDecorator({
    type: 'string',
    label: 'Result',
    description: 'base64 (аудио/изображение) или JSON',
  })
  result!: string;

  @FieldDecorator({
    type: 'string',
    label: 'Status',
    description: 'ok или описание ошибки',
  })
  status!: string;
}

@Executor<InputDto, OutputDto>({
  nodeType: 'plugin.huggingface.inference',
  name: 'Hugging Face: Inference',
  description:
    'Вызов моделей HF через официальный SDK: TTS, music (text-to-audio), image, text-to-video.',
  help: loadHelpFromFile(__dirname),
  pluginId: 'llm',
  inputs: InputDto,
  outputs: OutputDto,
  transport: {
    type: 'tcp',
    params: publicationPullEndpointFromEnv(),
  },
})
export class HuggingfaceInferenceExecutor {
  async execute(ctx: ExecContext<InputDto>): Promise<OutputDto> {
    const { task, model, provider, inputs, token } = ctx.inputs;
    const accessToken = token?.trim() ?? '';

    if (!model?.trim()) {
      return { result: '', status: 'error: укажите model' };
    }
    if (!provider?.trim()) {
      return {
        result: '',
        status: 'error: укажите provider (например hf-inference или auto)',
      };
    }

    const text = typeof inputs === 'string' ? inputs : String(inputs ?? '');
    const providerArg = provider.trim() as InferenceProviderOrPolicy;

    try {
      if (task === 'textToSpeech') {
        const blob = await hfTextToSpeech({
          accessToken,
          model,
          provider: providerArg,
          inputs: text,
        });
        const base64 = await blobToBase64(blob);
        return { result: base64, status: 'ok' };
      }

      if (task === 'textToImage') {
        const blob = await hfTextToImage({
          accessToken,
          model,
          provider: providerArg,
          inputs: text,
        });
        const base64 = await blobToBase64(blob as unknown as Blob);
        return { result: base64, status: 'ok' };
      }

      if (task === 'textToAudio') {
        const data = await hfRequest<Blob | ArrayBuffer>(
          { accessToken, model, provider: providerArg, inputs: text },
          { task: 'text-to-audio' },
        );
        if (data instanceof Blob) {
          const base64 = await blobToBase64(data);
          return { result: base64, status: 'ok' };
        }
        if (data instanceof ArrayBuffer) {
          const base64 = Buffer.from(data).toString('base64');
          return { result: base64, status: 'ok' };
        }
        return {
          result:
            typeof data === 'string' ? data : JSON.stringify(data as object),
          status: 'ok',
        };
      }

      if (task === 'textToVideo') {
        const blob = await hfTextToVideo({
          accessToken,
          model,
          provider: providerArg,
          inputs: text,
        });
        const base64 = await blobToBase64(blob as unknown as Blob);
        return { result: base64, status: 'ok' };
      }

      return {
        result: '',
        status: `error: неизвестная задача ${String(task)}`,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { result: '', status: `error: ${message}` };
    }
  }
}
