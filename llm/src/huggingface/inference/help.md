# Hugging Face: Inference (плагин)

Вызов моделей Hugging Face через официальный SDK `@huggingface/inference`. Поддерживаются задачи: **TTS**, **музыка (text-to-audio)**, **text-to-image**, **text-to-video**.

## Параметры

- **Task** — тип задачи: `textToSpeech`, `textToAudio`, `textToImage`, `textToVideo`.
- **Model** — id модели на Hub (см. таблицу ниже).
- **Provider** — обязательный. Провайдер инференса: `hf-inference` (официальный HF API), `auto` (автовыбор по модели из настроек пользователя на hf.co/settings/inference-providers), или сторонний: `fal-ai`, `replicate`, `together`, `nvidia` и др.
- **Inputs** — текст: для TTS/музыки — что озвучить/описание; для image/video — промпт.
- **Token** — ref на секрет с HF access token.

## Рекомендуемые модели (Inference API)

| Задача            | Task           | Пример модели                          |
| ----------------- | -------------- | -------------------------------------- |
| Text-to-Speech    | textToSpeech   | `suno/bark-small`, `microsoft/speecht5_tts` |
| Music generation  | textToAudio    | `facebook/musicgen-small`              |
| Text-to-Image     | textToImage    | любые image-модели с Hub               |
| Text-to-Video     | textToVideo    | `Wan-AI/Wan2.2-T2V`, `tencent/HunyuanVideo` (если доступны через API) |

Для text-to-video не все модели доступны через Hosted Inference API; часть работает только через Diffusers (Python) или Gradio Spaces.

## Выходы

- **result** — base64-строка (аудио/изображение/видео) или JSON для иных ответов.
- **status** — ok или описание ошибки.
