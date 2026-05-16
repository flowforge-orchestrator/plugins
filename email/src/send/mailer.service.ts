import * as fs from 'fs/promises';
import * as path from 'path';
import { createTransport } from 'nodemailer';

export type InlineAttachment = { filename: string; base64: string };

export interface SendEmailPayload {
  to: string;
  subject: string;
  text?: string;
  html?: string;
  attachmentPath?: string;
  attachmentFilename?: string;
  attachment?: InlineAttachment;
  attachments?: InlineAttachment[];
  from?: string;
}

export interface SendEmailOptions {
  host: string;
  port: number;
  secure: boolean;
  user?: string;
  pass?: string;
}

export class MailerService {
  async sendEmail(
    {
      to,
      subject,
      text,
      html,
      attachmentPath,
      attachmentFilename,
      attachment,
      attachments: attachmentsInput,
      from,
    }: SendEmailPayload,
    { host, port, secure, user, pass }: SendEmailOptions,
  ): Promise<unknown> {
    const transport = createTransport({
      host,
      port,
      secure,
      ...(user && pass ? { auth: { user, pass } } : {}),
    });
    const list: { filename: string; content: Buffer }[] = [];
    if (attachmentPath?.trim()) {
      list.push({
        filename: attachmentFilename?.trim() || path.basename(attachmentPath),
        content: await fs.readFile(attachmentPath),
      });
    }
    const inline = normalizeInlineAttachments(attachment, attachmentsInput);
    for (const a of inline) {
      if (a.base64) {
        list.push({
          filename: a.filename || 'attachment.bin',
          content: Buffer.from(a.base64, 'base64'),
        });
      }
    }
    const attachments = list.length ? list : undefined;
    return transport.sendMail({
      from,
      to,
      subject,
      text,
      html,
      attachments,
    });
  }
}

function normalizeInlineAttachments(
  attachment?: InlineAttachment,
  attachments?: InlineAttachment[],
): InlineAttachment[] {
  const out: InlineAttachment[] = [];
  if (attachment?.base64) out.push(attachment);
  if (Array.isArray(attachments)) {
    for (const a of attachments) {
      if (a && typeof a === 'object' && a.base64) out.push(a);
    }
  }
  return out;
}
