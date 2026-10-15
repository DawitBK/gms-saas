import { Request, Response } from "express";
import { UserService } from "./user.service";
import { sendPaginated, ok, created } from "../../core/utils/helpers";
import { userService as defaultUserService } from "../../composition";
import { resolveLimit } from "../../core/utils/pagination";

export class UserController {
  private userService: UserService;

  constructor(userService: UserService = defaultUserService) {
    this.userService = userService;
  }

  public getProfile = async (req: Request, res: Response): Promise<void> => {
    // req.user guaranteed by requireAuth
    const userDto = await this.userService.getUser(req.user!.id, {
      id: req.user!.id,
      roles: req.userRoles,
      office_id: req.user?.office_id,
    });
    ok(res, userDto);
  };

  public getUserById = async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params as unknown as { id: number };
    const userDto = await this.userService.getUser(id, {
      id: req.user!.id,
      roles: req.userRoles,
      office_id: req.user?.office_id,
    });
    ok(res, userDto);
  };

  public listUsers = async (req: Request, res: Response): Promise<void> => {
    const query = req.query as {
      page?: number;
      limit?: number;
      include_archived?: "true" | "false";
      q?: string;
      sort_by?: string;
      sort_order?: string;
    };
    const page = query.page ?? 1;
    // Same uncapped-limit bypass the guest directory had: the raw query value
    // went straight to findAndCountAll, so ?limit=999999999 dumped the whole
    // staff table in one response. resolveLimit applies MAX_PAGE_LIMIT (200).
    const limit = resolveLimit(query.limit, "paginated");
    const archived = (query.include_archived ?? "false") === "true";

    const search = typeof query.q === 'string' ? query.q.trim() : undefined;
    const sortBy = typeof query.sort_by === 'string' ? query.sort_by : 'created_at';
    const sortOrder = typeof query.sort_order === 'string' ? query.sort_order : 'DESC';

    const { users, meta } = await this.userService.listUsers(
      {
        id: req.user!.id,
        roles: req.userRoles,
        office_id: req.user?.office_id,
      },
      page,
      limit,
      archived,
      search,
      sortBy,
      sortOrder
    );
    sendPaginated(res, users, {
      ...meta,
      filters: {
        include_archived: archived,
        q: search || null,
      },
      sort: {
        by: sortBy,
        order: sortOrder,
      },
    });
  };

  public restoreUser = async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params as unknown as { id: number };
    await this.userService.restoreUser(id, {
      id: req.user!.id,
      roles: req.userRoles,
      office_id: req.user?.office_id,
    });
    ok(res, { id, restored: true });
  };

  public createUser = async (req: Request, res: Response): Promise<void> => {
    const user = await this.userService.createUser(
      {
        id: req.user!.id,
        roles: req.userRoles,
        office_id: req.user?.office_id,
      },
      req.body,
    );
    created(res, user);
  };

  public updateUser = async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params as unknown as { id: number };
    const user = await this.userService.updateUser(
      id,
      {
        id: req.user!.id,
        roles: req.userRoles,
        office_id: req.user?.office_id,
      },
      req.body,
    );
    ok(res, user);
  };

  public softDeleteUser = async (
    req: Request,
    res: Response,
  ): Promise<void> => {
    const { id } = req.params as unknown as { id: number };
    await this.userService.removeUser(id, {
      id: req.user!.id,
      roles: req.userRoles,
      office_id: req.user?.office_id,
    });
    ok(res, { id, deleted: true });
  };

  public setRoles = async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params as unknown as { id: number };
    const user = await this.userService.setUserRoles(id, req.body.roles, {
      id: req.user!.id,
      roles: req.userRoles,
      office_id: req.user?.office_id,
    });
    ok(res, user);
  };

  public bulkImport = async (req: Request, res: Response): Promise<void> => {
    const { rows } = req.body;
    if (!Array.isArray(rows)) {
      throw new Error('Invalid payload: rows must be an array');
    }
    const results = await this.userService.bulkImport(
      {
        id: req.user!.id,
        roles: req.userRoles,
        office_id: req.user?.office_id,
      },
      rows
    );
    ok(res, results);
  };
}
