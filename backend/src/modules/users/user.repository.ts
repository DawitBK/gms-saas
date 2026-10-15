import { excludePlatformAdminsWhere } from '../../shared/auth/platform-admin';
import { Transaction, Op } from 'sequelize';
import { resolveSortColumn, resolveSortOrder } from '../../core/utils/sorting';
import { Department, Host, User, Role, HostProfile, GuestProfile, Service, Office } from '../../infrastructure/database/models';
import { normalizeRoles } from '../../shared/auth/roles';

const hostInclude = {
  model: Host,
  as: 'host',
  required: false,
  include: [
    {
      model: Service,
      as: 'services',
      through: { attributes: [] },
      required: false,
    },
    { model: Department, as: 'department', required: false },
    { model: Office, as: 'office', required: false },
  ],
};

export class UserRepository {
  public async findById(id: number, transaction?: Transaction) {
    return User.findByPk(id, {
      include: [
        { model: Role, as: 'roles', through: { attributes: [] } },
        hostInclude,
        { model: Office, as: 'office', required: false },
        { model: HostProfile, as: 'hostProfile', required: false },
        { model: GuestProfile, as: 'guestProfile', required: false },
      ],
      transaction,
    });
  }

  public async findByIdWithDeleted(id: number, transaction?: Transaction) {
    return User.findByPk(id, {
      include: [
        { model: Role, as: 'roles', through: { attributes: [] } },
        hostInclude,
        { model: Office, as: 'office', required: false },
        { model: HostProfile, as: 'hostProfile', required: false },
        { model: GuestProfile, as: 'guestProfile', required: false },
      ],
      paranoid: false,
      transaction,
    });
  }

  public async findAll(
    filter: any = {},
    limit: number = 20,
    offset: number = 0,
    search?: string,
    sortBy: string = 'created_at',
    sortOrder: string = 'DESC'
  ) {
    const where: any = { ...filter };
    if (search) {
      where[Op.or] = [
        { full_name: { [Op.iLike]: `%${search}%` } },
        { email: { [Op.iLike]: `%${search}%` } },
        { phone: { [Op.iLike]: `%${search}%` } },
      ];
    }
    // The platform administrator is absent from every list (shared/auth/platform-admin.ts).
    where[Op.and] = [...(where[Op.and] ?? []), excludePlatformAdminsWhere()];

    return User.findAndCountAll({
      where,
      limit,
      offset,
      order: [[resolveSortColumn(User, sortBy), resolveSortOrder(sortOrder)]],
      include: [
        { model: Role, as: 'roles', through: { attributes: [] } },
        hostInclude,
        { model: Office, as: 'office', required: false },
        { model: HostProfile, as: 'hostProfile', required: false },
        { model: GuestProfile, as: 'guestProfile', required: false },
      ],
    });
  }

  public async update(id: number, data: any, transaction?: Transaction) {
    return User.update(data, { where: { id }, transaction });
  }

  public async softDelete(id: number) {
    return User.destroy({ where: { id } });
  }

  public async restore(id: number) {
    return User.restore({ where: { id } });
  }

  public async findAllWithDeleted(
    filter: any = {},
    limit: number = 20,
    offset: number = 0,
    search?: string,
    sortBy: string = 'created_at',
    sortOrder: string = 'DESC'
  ) {
    const where: any = { ...filter };
    if (search) {
      where[Op.or] = [
        { full_name: { [Op.iLike]: `%${search}%` } },
        { email: { [Op.iLike]: `%${search}%` } },
        { phone: { [Op.iLike]: `%${search}%` } },
      ];
    }
    where[Op.and] = [...(where[Op.and] ?? []), excludePlatformAdminsWhere()];

    return User.findAndCountAll({
      where,
      limit,
      offset,
      order: [[resolveSortColumn(User, sortBy), resolveSortOrder(sortOrder)]],
      paranoid: false,
      include: [
        { model: Role, as: 'roles', through: { attributes: [] } },
        hostInclude,
        { model: Office, as: 'office', required: false },
        { model: HostProfile, as: 'hostProfile', required: false },
        { model: GuestProfile, as: 'guestProfile', required: false },
      ],
    });
  }

  public async setRoles(userId: number, roleNames: string[]) {
    const user = await User.findByPk(userId);
    if (!user) return null;
    const normalized = normalizeRoles(roleNames);
    const roles = await Role.findAll({ where: { name: normalized } });
    // @ts-ignore - Sequelize mixin
    await (user as any).setRoles(roles);
    return await this.findById(userId);
  }

  public async findHostByUserId(userId: number, transaction?: Transaction) {
    return Host.findOne({ where: { user_id: userId }, transaction });
  }

  public async createHostProfile(
    data: { user_id: number; office_id: number | null; department_id: number | null; active?: boolean },
    transaction?: Transaction,
  ) {
    return Host.create(
      {
        user_id: data.user_id,
        office_id: data.office_id,
        department_id: data.department_id,
        active: data.active ?? true,
      },
      { transaction },
    );
  }

  public async findDepartmentById(id: number, transaction?: Transaction) {
    return Department.findByPk(id, { transaction });
  }

  public async findUserOfficeId(id: number, transaction?: Transaction) {
    const user = await User.findByPk(id, { attributes: ['office_id'], transaction });
    return Number(user?.get('office_id') ?? 0) || null;
  }

  public async updateUserOffice(id: number, officeId: number, transaction?: Transaction) {
    return User.update({ office_id: officeId }, { where: { id }, transaction });
  }
}
