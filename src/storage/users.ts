import type { Database } from "better-sqlite3";
import { decryptPlaneToken, encryptPlaneToken } from "../crypto/encrypt.js";

export type SetPlaneTokenInput = {
  slackUserId: string;
  slackTeamId: string;
  planeToken: string;
  planeUserEmail?: string;
  slackUsername?: string;
};

export class UsersRepository {
  constructor(
    private readonly db: Database,
    private readonly encryptionKey: Buffer,
  ) {}

  getPlaneToken(slackUserId: string): string | null {
    const row = this.db
      .prepare(
        "SELECT plane_token_encrypted, plane_token_iv, plane_token_auth_tag FROM users WHERE slack_user_id = ?",
      )
      .get(slackUserId) as
      | {
          plane_token_encrypted: Buffer;
          plane_token_iv: Buffer;
          plane_token_auth_tag: Buffer;
        }
      | undefined;
    if (!row) return null;
    return decryptPlaneToken(
      {
        ciphertext: row.plane_token_encrypted,
        iv: row.plane_token_iv,
        authTag: row.plane_token_auth_tag,
      },
      this.encryptionKey,
    );
  }

  setPlaneToken(input: SetPlaneTokenInput): void {
    const { ciphertext, iv, authTag } = encryptPlaneToken(input.planeToken, this.encryptionKey);
    const now = Date.now();
    this.db
      .prepare(
        `INSERT INTO users (
          slack_user_id, slack_team_id, slack_username, plane_token_encrypted, plane_token_iv, plane_token_auth_tag,
          plane_user_email, created_at, updated_at, last_used_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
        ON CONFLICT(slack_user_id) DO UPDATE SET
          slack_team_id = excluded.slack_team_id,
          slack_username = COALESCE(excluded.slack_username, users.slack_username),
          plane_token_encrypted = excluded.plane_token_encrypted,
          plane_token_iv = excluded.plane_token_iv,
          plane_token_auth_tag = excluded.plane_token_auth_tag,
          plane_user_email = COALESCE(excluded.plane_user_email, users.plane_user_email),
          updated_at = excluded.updated_at`,
      )
      .run(
        input.slackUserId,
        input.slackTeamId,
        input.slackUsername ?? null,
        ciphertext,
        iv,
        authTag,
        input.planeUserEmail ?? null,
        now,
        now,
      );
  }

  deletePlaneToken(slackUserId: string): void {
    this.db.prepare("DELETE FROM users WHERE slack_user_id = ?").run(slackUserId);
  }

  touchLastUsed(slackUserId: string): void {
    this.db
      .prepare("UPDATE users SET last_used_at = ? WHERE slack_user_id = ?")
      .run(Date.now(), slackUserId);
  }
}
