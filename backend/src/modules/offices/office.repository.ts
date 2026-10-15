import { Op } from "sequelize";
import { resolveSortColumn, resolveSortOrder } from "../../core/utils/sorting";
import { Office } from "../../infrastructure/database/models";
import { CreateOfficeInput, UpdateOfficeInput } from "./office.dto";

export class OfficeRepository {
  public async findAll(
    includeArchived = false,
    page = 1,
    limit = 10000,
    search?: string,
    sortBy = "name",
    sortOrder = "ASC"
  ) {
    const where: any = {};
    if (!includeArchived) {
      where.active = true;
    }
    if (search) {
      where[Op.or] = [
        { name: { [Op.iLike]: `%${search}%` } },
        { timezone: { [Op.iLike]: `%${search}%` } },
      ];
    }

    const offset = (page - 1) * limit;
    return Office.findAndCountAll({
      where,
      limit,
      offset,
      order: [[resolveSortColumn(Office, sortBy), resolveSortOrder(sortOrder)]],
      raw: true,
    });
  }

  public async findByIds(
    ids: number[],
    includeArchived = false,
    page = 1,
    limit = 10000,
    search?: string,
    sortBy = "name",
    sortOrder = "ASC"
  ) {
    const where: any = { id: ids };
    if (!includeArchived) {
      where.active = true;
    }
    if (search) {
      where[Op.or] = [
        { name: { [Op.iLike]: `%${search}%` } },
        { timezone: { [Op.iLike]: `%${search}%` } },
      ];
    }

    const offset = (page - 1) * limit;
    return Office.findAndCountAll({
      where,
      limit,
      offset,
      order: [[resolveSortColumn(Office, sortBy), resolveSortOrder(sortOrder)]],
      raw: true,
    });
  }

  public async findById(id: number) {
    return Office.findByPk(id);
  }

  public async create(data: CreateOfficeInput) {
    return Office.create(data as unknown as Record<string, unknown>);
  }

  public async update(id: number, data: Partial<CreateOfficeInput>) {
    const office = await Office.findByPk(id);
    if (!office) return null;
    return office.update(data as Record<string, unknown>);
  }

  public async softDelete(id: number) {
    const office = await Office.findByPk(id);
    if (!office) return null;
    return office.update({ active: false } as UpdateOfficeInput as Record<
      string,
      unknown
    >);
  }

  public async restore(id: number) {
    const office = await Office.findByPk(id);
    if (!office) return null;
    return office.update({ active: true } as UpdateOfficeInput as Record<
      string,
      unknown
    >);
  }
}
