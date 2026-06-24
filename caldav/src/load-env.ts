import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { config } from 'dotenv';

export function loadLocalEnv(): void {
  const candidates = [
    resolve(process.cwd(), '.env'),
    resolve(__dirname, '../.env'),
  ];
  for (const path of candidates) {
    if (existsSync(path)) {
      config({ path });
      return;
    }
  }
}

loadLocalEnv();
