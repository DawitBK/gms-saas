import { GuestProfile, User } from '../../infrastructure/database/models';
import { Notification } from '../../infrastructure/database/models/Notification';

export class NotificationRepository {
  public async findByUser(userId: number, page = 1, limit = 20) {
    const offset = (page - 1) * limit;
    return await Notification.findAndCountAll({
      where: { user_id: userId },
      limit,
      offset,
      order: [['created_at', 'DESC']]
    });
  }

  public async create(data: any) {
    return await Notification.create(data);
  }

  public async getUserDeliveryProfile(userId: number) {
    const user = await User.findByPk(userId, {
      include: [{ model: GuestProfile, as: 'guestProfile', required: false }],
    });

    if (!user) {
      return null;
    }

    return {
      id: user.id,
      full_name: user.full_name,
      email: user.email,
      phone: user.phone,
      preferred_notification_channel:
        (user as any).guestProfile?.preferred_notification_channel ?? 'EMAIL',
    };
  }

  public async markAsReadForUser(userId: number, id: number) {
    const notif = await Notification.findOne({ where: { id, user_id: userId } });
    if (!notif) return null;
    return await notif.update({ is_read: true });
  }

  public async markAllAsReadForUser(userId: number) {
    await Notification.update({ is_read: true }, { where: { user_id: userId, is_read: false } });
    return true;
  }
}
