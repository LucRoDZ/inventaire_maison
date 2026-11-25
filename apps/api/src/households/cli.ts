import 'reflect-metadata';
import { randomBytes } from 'node:crypto';
import { Writable } from 'node:stream';
import { createInterface } from 'node:readline/promises';
import { parseArgs } from 'node:util';
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import {
  HOUSEHOLD_NAME_MAX_LENGTH,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  USERNAME_PATTERN,
} from '@inventaire/shared';
import { PasswordService } from '../auth/password.service';
import { ClockModule } from '../common/clock';
import { ConfigModule } from '../config/config.module';
import { loadLocalEnv } from '../config/load-env';
import { DatabaseModule } from '../database/database.module';
import { HouseholdsModule } from './households.module';
import { HouseholdsService } from './households.service';

/** Only what the script needs: no HTTP server, no first-admin bootstrap. */
@Module({
  imports: [ConfigModule, ClockModule, DatabaseModule, HouseholdsModule],
  providers: [PasswordService],
})
class HouseholdCliModule {}

const USAGE =
  'Usage : npm run household:create -- --name "Nom du foyer" --admin "pseudo"\n' +
  'Le mot de passe est demandé ; laissé vide (ou sans terminal), il est généré et affiché une fois.';

/** Reads a password without echoing it; empty when stdin is not a terminal. */
async function askPassword(): Promise<string> {
  if (!process.stdin.isTTY) return '';
  let muted = false;
  const output = new Writable({
    write(chunk: Buffer, _encoding, callback) {
      if (!muted) process.stdout.write(chunk);
      callback();
    },
  });
  const rl = createInterface({ input: process.stdin, output, terminal: true });
  const question = rl.question(
    `Mot de passe (${PASSWORD_MIN_LENGTH} à ${PASSWORD_MAX_LENGTH} caractères, vide pour en générer un) : `,
  );
  muted = true;
  const answer = await question;
  rl.close();
  process.stdout.write('\n');
  return answer;
}

async function run(): Promise<void> {
  loadLocalEnv(__dirname);
  const { values } = parseArgs({
    options: { name: { type: 'string' }, admin: { type: 'string' }, help: { type: 'boolean' } },
  });
  if (values.help) {
    console.log(USAGE);
    return;
  }
  const name = values.name?.trim() ?? '';
  const username = values.admin?.trim().toLowerCase() ?? '';
  if (name.length < 1 || name.length > HOUSEHOLD_NAME_MAX_LENGTH) {
    throw new Error(
      `--name : nom de foyer de 1 à ${HOUSEHOLD_NAME_MAX_LENGTH} caractères.\n${USAGE}`,
    );
  }
  if (!USERNAME_PATTERN.test(username)) {
    throw new Error(`--admin : pseudo de 3 à 30 caractères (a-z, 0-9, _ . -).\n${USAGE}`);
  }
  let password = await askPassword();
  const generated = password === '';
  if (generated) password = randomBytes(12).toString('base64url');
  if (password.length < PASSWORD_MIN_LENGTH || password.length > PASSWORD_MAX_LENGTH) {
    throw new Error(`Mot de passe de ${PASSWORD_MIN_LENGTH} à ${PASSWORD_MAX_LENGTH} caractères.`);
  }

  const app = await NestFactory.createApplicationContext(HouseholdCliModule, {
    logger: ['error', 'warn'],
  });
  try {
    const passwordHash = await app.get(PasswordService).hash(password);
    const created = await app.get(HouseholdsService).createWithAdmin(name, username, passwordHash);
    console.log(`Foyer « ${created.name} » créé avec le compte administrateur « ${username} ».`);
    if (generated) {
      // Shown once, never stored in clear nor written to a log.
      console.log(`Mot de passe généré (affiché une seule fois) : ${password}`);
    }
  } finally {
    await app.close();
  }
}

run().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
