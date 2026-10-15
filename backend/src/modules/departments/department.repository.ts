import { Department } from "../../infrastructure/database/models/Department";
import { Office } from "../../infrastructure/database/models/Office";
import { Op } from "sequelize";
import { resolveSortColumn, resolveSortOrder } from "../../core/utils/sorting";

/**
 * Department Repository
 * Handles direct database interactions for the Department model.
 * All list queries eagerly load the parent Office association
 * so the frontend receives full relational context for filtering.
 */

const STANDARD_INCLUDES = [
  { model: Office, attributes: ['id', 'name'] },
];

export class DepartmentRepository {
  public async findAll(
    includeArchived = false,
    page = 1,
    limit = 10000,
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

    const offset = (page - 1) * limit;
    return await Department.findAndCountAll({
      where,
      paranoid: !includeArchived,
      include: STANDARD_INCLUDES,
      limit,
      offset,
      order: [[resolveSortColumn(Department, sortBy), resolveSortOrder(sortOrder)]],
    });
  }

  public async findByOffice(
    officeId: number,
    includeArchived = false,
    page = 1,
    limit = 10000,
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

    const offset = (page - 1) * limit;
    return await Department.findAndCountAll({
      where,
      paranoid: !includeArchived,
      include: STANDARD_INCLUDES,
      limit,
      offset,
      order: [[resolveSortColumn(Department, sortBy), resolveSortOrder(sortOrder)]],
    });
  }

  public async findById(id: number, includeArchived = false) {
    return await Department.findByPk(id, {
      include: STANDARD_INCLUDES,
      ...(includeArchived ? { paranoid: false } : {}),
    });
  }

  public async create(data: any) {
    const dept = await Department.create(data);
    return await Department.findByPk(dept.id, { include: STANDARD_INCLUDES });
  }

  public async update(id: number, data: any) {
    const dept = await Department.findByPk(id);
    if (!dept) return null;
    await dept.update(data);
    return await Department.findByPk(id, { include: STANDARD_INCLUDES });
  }

  public async delete(id: number) {
    const dept = await this.findById(id);
    if (!dept) return false;
    await dept.destroy();
    return true;
  }

  public async restore(id: number) {
    const dept = await Department.findByPk(id, { paranoid: false });
    if (!dept) return false;
    await dept.restore();
    return true;
  }
}
