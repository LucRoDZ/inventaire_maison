import { Injectable, type OnModuleInit } from '@nestjs/common';
import * as argon2 from 'argon2';

const OPTIONS: argon2.HashOptions = {
  type: argon2.argon2id,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
};

@Injectable()
export class PasswordService implements OnModuleInit {
  private dummyHash: Promise<string> | undefined;

  /** Computes the dummy hash at start-up, so that the first unknown username costs no extra hash. */
  async onModuleInit(): Promise<void> {
    await this.getDummyHash();
  }

  private getDummyHash(): Promise<string> {
    this.dummyHash ??= this.hash('dummy-password-for-timing');
    return this.dummyHash;
  }

  hash(password: string): Promise<string> {
    return argon2.hash(password, OPTIONS);
  }

  async verify(hash: string, password: string): Promise<boolean> {
    try {
      return await argon2.verify(hash, password);
    } catch {
      return false;
    }
  }

  /** Spends the same time as a real check, for unknown or disabled accounts. */
  async verifyDummy(password: string): Promise<void> {
    await this.verify(await this.getDummyHash(), password);
  }
}
