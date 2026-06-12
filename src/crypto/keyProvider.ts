export interface KeyProvider {
  getEncryptionKey(): Promise<Buffer>;
}

export class EnvKeyProvider implements KeyProvider {
  constructor(private readonly key: Buffer) {}

  async getEncryptionKey(): Promise<Buffer> {
    return this.key;
  }
}
