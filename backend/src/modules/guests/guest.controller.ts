import { Request, Response } from 'express';
import { sendPaginated, sendSuccess } from '../../core/utils/helpers';
import { resolveLimit } from '../../core/utils/pagination';
import { isAdminRole } from '../../shared/auth/roles';
import { GuestService } from './guest.service';
import { guestService as defaultGuestService } from '../../composition';

export class GuestController {
  private guestService: GuestService;

  constructor(guestService: GuestService = defaultGuestService) {
    this.guestService = guestService;
  }

  public getOwnProfile = async (req: Request, res: Response) => {
    const profile = await this.guestService.getOwnProfile(req.user!.id);
    sendSuccess(res, profile);
  };

  public getGuestProfile = async (req: Request, res: Response) => {
    const profile = await this.guestService.getGuestProfile(Number(req.params.id), {
      id: req.user!.id,
      roles: req.userRoles ?? [],
      office_id: req.user!.office_id,
    });
    sendSuccess(res, profile);
  };

  public updateOwnProfile = async (req: Request, res: Response) => {
    const profile = await this.guestService.updateOwnProfile(req.user!.id, req.body);
    sendSuccess(res, profile);
  };

  public updateGuestProfile = async (req: Request, res: Response) => {
    const actor = {
      id: req.user!.id,
      roles: req.userRoles ?? [],
      office_id: req.user!.office_id,
    };

    // Same office scope as reading the profile. Editing was left unscoped when
    // reading was, so a receptionist at one office could edit (and VIP-flag) a
    // guest belonging to another. Throws 404 when out of scope.
    await this.guestService.getGuestProfile(Number(req.params.id), actor);

    // Was hardcoded `true`. The route admits reception as well as admin, and
    // this flag is what permits setting `is_vip` — which is not cosmetic: the
    // VIP branch in visit creation bypasses the slot-lock and overlap checks.
    // Granting it is an admin decision, so reception now edits everything on
    // the profile except that one field.
    const isAdmin = (req.userRoles ?? []).some((role) => isAdminRole(role));
    const profile = await this.guestService.updateOwnProfile(Number(req.params.id), req.body, isAdmin);
    sendSuccess(res, profile);
  };

  public listGuests = async (req: Request, res: Response) => {
    const query = req.query as Record<string, any>;
    const page = Number(query.page ?? 1);
    // Was `Number(query.limit ?? 20)` passed straight through to
    // findAndCountAll, so `?limit=999999999` returned the entire guest table
    // in one response — every guest's government ID, phone, emergency
    // contact, document URL, OCR'd ID text and VIP flag. resolveLimit is the
    // MAX_PAGE_LIMIT (200) cap every other paginated endpoint is meant to use.
    const limit = resolveLimit(query.limit, 'paginated');
    const search = typeof query.q === 'string' ? query.q : undefined;
    const sortBy = typeof query.sort_by === 'string' ? query.sort_by : 'created_at';
    const sortOrder = typeof query.sort_order === 'string' ? query.sort_order : 'DESC';
    const filter = typeof query.filter === 'string' ? query.filter : undefined;

    const { data, meta } = await this.guestService.listGuests(
      page,
      limit,
      search,
      sortBy,
      sortOrder,
      filter,
      // Office scoping is resolved in the service, from the caller's own
      // identity — never from anything in the query string.
      { id: req.user!.id, roles: req.userRoles ?? [], office_id: req.user!.office_id },
    );
    sendPaginated(res, data, {
      ...meta,
      filters: {
        q: search ?? null,
      },
      sort: {
        by: sortBy,
        order: sortOrder,
      },
    });
  };

  public bulkImport = async (req: Request, res: Response) => {
    const { rows } = req.body;
    if (!Array.isArray(rows)) {
      throw new Error('Invalid payload: rows must be an array');
    }
    const results = await this.guestService.bulkImport(rows);
    sendSuccess(res, results);
  };
}
