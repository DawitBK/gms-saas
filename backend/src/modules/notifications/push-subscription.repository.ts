import { QueryTypes } from "sequelize";
import { sequelize } from "../../infrastructure/database/models";

export type StoredPushSubscription = {
  id: number;
  user_id: number;
  endpoint: string;
  p256dh: string;
  auth: string;
  user_agent: string | null;
};

export class PushSubscriptionRepository {
  public async save(
    userId: number,
    subscriptionJson: any,
    userAgent?: string,
  ): Promise<void> {
    const endpoint = subscriptionJson?.endpoint;
    const p256dh = subscriptionJson?.keys?.p256dh;
    const auth = subscriptionJson?.keys?.auth;
    if (!endpoint || !p256dh || !auth) return;

    await sequelize.query(
      `
      INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth, user_agent, created_at, updated_at)
      VALUES (:userId, :endpoint, :p256dh, :auth, :userAgent, NOW(), NOW())
      ON CONFLICT (endpoint)
      DO UPDATE SET
        user_id = EXCLUDED.user_id,
        p256dh = EXCLUDED.p256dh,
        auth = EXCLUDED.auth,
        user_agent = EXCLUDED.user_agent,
        updated_at = NOW()
      `,
      {
        replacements: { userId, endpoint, p256dh, auth, userAgent: userAgent ?? null },
        type: QueryTypes.INSERT,
      },
    );
  }

  public async findByUser(userId: number): Promise<StoredPushSubscription[]> {
    return sequelize.query(
      `
      SELECT id, user_id, endpoint, p256dh, auth, user_agent
      FROM push_subscriptions
      WHERE user_id = :userId
      ORDER BY updated_at DESC
      `,
      { replacements: { userId }, type: QueryTypes.SELECT },
    );
  }

  /**
   * Delete one of a user's own push subscriptions.
   *
   * `user_id` in the predicate is load-bearing, not belt-and-braces. This used
   * to delete by `endpoint` alone, and the endpoint is not a secret: it is a
   * push-service URL that appears in the browser, in service-worker code, and
   * in anything that logs a subscription payload. Anyone who obtained another
   * user's endpoint string could unsubscribe them, and the symptom is
   * "notifications quietly stopped arriving" — which nobody reports as an
   * attack, because it does not look like one.
   */
  public async delete(userId: number, endpoint: string): Promise<void> {
    await sequelize.query(
      "DELETE FROM push_subscriptions WHERE endpoint = :endpoint AND user_id = :userId",
      { replacements: { endpoint, userId }, type: QueryTypes.DELETE },
    );
  }

  public async deleteAllForUser(userId: number): Promise<void> {
    await sequelize.query(
      "DELETE FROM push_subscriptions WHERE user_id = :userId",
      { replacements: { userId }, type: QueryTypes.DELETE },
    );
  }
}
