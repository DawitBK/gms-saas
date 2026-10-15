import { Service } from '../../infrastructure/database/models/Service';
import { Office } from '../../infrastructure/database/models/Office';
import { Department } from '../../infrastructure/database/models/Department';
import { Host } from '../../infrastructure/database/models/Host';
import { User } from '../../infrastructure/database/models/User';
import { ServiceHost } from '../../infrastructure/database/models/ServiceHost';
import { Op, Transaction } from 'sequelize';
import { resolveSortColumn, resolveSortOrder } from '../../core/utils/sorting';
import { sequelize } from '../../infrastructure/database/sequelize';

/**
 * Service Repository
 * Domain storage logic for available visitor services.
 * All list queries eagerly load Office and Department associations
 * so the frontend receives the full relational context needed for
 * filtering and display without additional round-trips.
 */

const STANDARD_INCLUDES = [
  { model: Office, attributes: ['id', 'name'] },
  { model: Department, attributes: ['id', 'name', 'office_id'] },
  { 
    model: Host, 
    as: 'hosts', 
    attributes: ['id'],
    include: [{ model: User, as: 'user', attributes: ['id', 'full_name', 'email'] }]
  }
];

export class ServiceRepository {
  public async findAll(includeArchived = false) {
    if (includeArchived) {
      return await Service.findAll({ 
        where: { deleted_at: { [Op.ne]: null } }, 
        paranoid: false,
        include: STANDARD_INCLUDES,
        order: [['id', 'DESC']]
      });
    }
    return await Service.findAll({ 
      paranoid: true, 
      include: STANDARD_INCLUDES,
      order: [['id', 'DESC']] 
    });
  }

  public async findByOffice(officeId: number, includeArchived = false) {
    const where: any = { office_id: officeId };
    if (includeArchived) {
      where.deleted_at = { [Op.ne]: null };
      return await Service.findAll({ 
        where, 
        paranoid: false,
        include: STANDARD_INCLUDES,
        order: [['id', 'DESC']]
      });
    }
    return await Service.findAll({ 
      where, 
      paranoid: true,
      include: STANDARD_INCLUDES,
      order: [['id', 'DESC']]
    });
  }

  public async findAllPaginated(
    limit: number,
    offset: number,
    includeArchived = false,
    search?: string,
    sortBy = "name",
    sortOrder = "ASC"
  ) {
    const where: any = {};
    if (includeArchived) {
      where.deleted_at = { [Op.ne]: null };
    }
    if (search) {
      where.name = { [Op.iLike]: `%${search}%` };
    }

    return await Service.findAndCountAll({
      where,
      paranoid: !includeArchived,
      include: STANDARD_INCLUDES,
      limit,
      offset,
      order: [[resolveSortColumn(Service, sortBy), resolveSortOrder(sortOrder)]],
    });
  }

  public async findByOfficePaginated(
    officeId: number,
    limit: number,
    offset: number,
    includeArchived = false,
    search?: string,
    sortBy = "name",
    sortOrder = "ASC"
  ) {
    const where: any = { office_id: officeId };
    if (includeArchived) {
      where.deleted_at = { [Op.ne]: null };
    }
    if (search) {
      where.name = { [Op.iLike]: `%${search}%` };
    }

    return await Service.findAndCountAll({
      where,
      paranoid: !includeArchived,
      include: STANDARD_INCLUDES,
      limit,
      offset,
      order: [[resolveSortColumn(Service, sortBy), resolveSortOrder(sortOrder)]],
    });
  }

  public async findById(id: number, includeArchived = false) {
    return await Service.findByPk(id, {
      include: STANDARD_INCLUDES,
      ...(includeArchived ? { paranoid: false } : {}),
    });
  }

  public async create(data: any) {
    const { host_ids, ...serviceData } = data;

    return await sequelize.transaction(async (t) => {
      const service = await Service.create(serviceData, { transaction: t });

      if (host_ids && Array.isArray(host_ids)) {
        await ServiceHost.destroy({ where: { service_id: service.id }, transaction: t });
        if (host_ids.length > 0) {
          await ServiceHost.bulkCreate(
            host_ids.map((hostId: number) => ({
              service_id: service.id,
              host_id: hostId,
            })),
            { transaction: t }
          );
        }

        // Keep the denormalized host_ids array on the Service row in sync
        await service.update({ host_ids }, { transaction: t });
      }

      // Reload with associations so the response includes Office/Department names and Hosts
      return await Service.findByPk(service.id, { include: STANDARD_INCLUDES, transaction: t });
    });
  }

  public async update(id: number, data: any) {
    const { host_ids, ...serviceData } = data;
    const service = await Service.findByPk(id);
    if (!service) return null;

    return await sequelize.transaction(async (t) => {
      const updatePayload: any = { ...serviceData };
      if (host_ids !== undefined) updatePayload.host_ids = host_ids;

      await service.update(updatePayload, { transaction: t });

      if (host_ids !== undefined && Array.isArray(host_ids)) {
        // Refresh many-to-many associations atomically
        await ServiceHost.destroy({ where: { service_id: id }, transaction: t });
        if (host_ids.length > 0) {
          await ServiceHost.bulkCreate(
            host_ids.map((hostId: number) => ({
              service_id: id,
              host_id: hostId,
            })),
            { transaction: t }
          );
        }
      }

      return await Service.findByPk(id, { include: STANDARD_INCLUDES, transaction: t });
    });
  }

  public async softDelete(id: number) {
    const service = await this.findById(id);
    if (!service) return false;
    await service.destroy();
    return true;
  }

  public async restore(id: number) {
    const service = await Service.findByPk(id, { paranoid: false });
    if (!service) return false;
    await service.restore();
    return true;
  }

  /**
   * Add host associations to a service (idempotent)
   */
  public async addHosts(serviceId: number, hostIds: number[]) {
    if (!Array.isArray(hostIds) || hostIds.length === 0) return await this.findById(serviceId);

    return await sequelize.transaction(async (t: Transaction) => {
      // Normalize and dedupe requested host IDs
      const requested = Array.from(new Set(hostIds.map((h) => Number(h)).filter(Boolean)));

      // Find existing associations to avoid duplicates
      const existing = await ServiceHost.findAll({
        where: { service_id: serviceId, host_id: { [Op.in]: requested } },
        attributes: ['host_id'],
        transaction: t,
      });

      const existingIds = existing.map((r: any) => Number(r.host_id));
      const toCreate = requested.filter((id) => !existingIds.includes(id));

      if (toCreate.length > 0) {
        await ServiceHost.bulkCreate(
          toCreate.map((hostId) => ({ service_id: serviceId, host_id: hostId })),
          { transaction: t }
        );
      }

      // Sync denormalized host_ids array
      await this.syncHostIds(serviceId, t);

      return await Service.findByPk(serviceId, { include: STANDARD_INCLUDES, transaction: t });
    });
  }

  /**
   * Remove host associations from a service
   */
  public async removeHosts(serviceId: number, hostIds: number[]) {
    if (!Array.isArray(hostIds) || hostIds.length === 0) return await this.findById(serviceId);

    return await sequelize.transaction(async (t: Transaction) => {
      const ids = Array.from(new Set(hostIds.map((h) => Number(h)).filter(Boolean)));
      await ServiceHost.destroy({ where: { service_id: serviceId, host_id: { [Op.in]: ids } }, transaction: t });

      // Sync denormalized host_ids array
      await this.syncHostIds(serviceId, t);

      return await Service.findByPk(serviceId, { include: STANDARD_INCLUDES, transaction: t });
    });
  }

  /**
   * Recompute and persist the denormalized host_ids array for a service
   */
  public async syncHostIds(serviceId: number, transaction?: Transaction) {
    const rows = await ServiceHost.findAll({ where: { service_id: serviceId }, attributes: ['host_id'], transaction });
    const hostIds = rows.map((r: any) => Number(r.host_id));
    await Service.update({ host_ids: hostIds }, { where: { id: serviceId }, transaction });
    return hostIds;
  }
}
