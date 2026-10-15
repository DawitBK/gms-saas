/**
 * Composition root — the ONE place every controller-facing service is
 * constructed. Exists to fix two things the previous
 * "every controller does `new XService()` in its own constructor" pattern
 * had no way to fix:
 *
 *  1. A service shared by more than one controller (ApprovalService, used by
 *     both ApprovalController and VisitController) got a SEPARATE instance
 *     per controller — two independent object graphs for the same job in
 *     the same process, purely as an accident of which file happened to
 *     construct it.
 *  2. No controller had a seam to inject a fake service/repository in a
 *     test — the constructor always built the real thing.
 *
 * Each controller's constructor now takes its service(s) as an OPTIONAL
 * parameter defaulting to the singleton exported here (see e.g.
 * visit.controller.ts). Route-wiring files that do `new VisitController()`
 * need no changes at all — the default parameter supplies the shared
 * instance. A test can still pass a fake explicitly.
 *
 * Deliberately NOT a DI container/library, and deliberately NOT chasing
 * every service's OWN internal `new XService()` construction (e.g.
 * ApprovalService building its own private VisitService) — several of
 * those are already lazy/inline specifically to dodge circular imports
 * between modules (see visit.command.service.ts's inline
 * `new CredentialService()`), and unwinding that is a separate, larger
 * change with its own risk. This fixes the concrete, named defect —
 * duplicate graphs at the controller boundary — with the minimum new
 * machinery.
 */
import { ApprovalService } from './modules/approvals/approval.service';
import { AuthService } from './modules/auth/auth.service';
import { CheckinService } from './modules/checkin/checkin.service';
import { CredentialService } from './modules/credentials/credential.service';
import { DepartmentService } from './modules/departments/department.service';
import { GuestService } from './modules/guests/guest.service';
import { HostService } from './modules/hosts/host.service';
import { NotificationDomainService } from './modules/notifications/notification.service';
import { OfficeService } from './modules/offices/office.service';
import { OperationsService } from './modules/operations/operations.service';
import { AvailabilityService } from './modules/scheduling/availability.service';
import { UniFiWebhookService } from './modules/unifi-webhooks/unifi-webhook.service';
import { UserService } from './modules/users/user.service';
import { VisitService } from './modules/visits/visit.service';
import { ListServicesInteractor } from './modules/services/use-cases/ListServicesInteractor';
import { CreateServiceInteractor } from './modules/services/use-cases/CreateServiceInteractor';
import { UpdateServiceInteractor } from './modules/services/use-cases/UpdateServiceInteractor';
import { AddServiceHostsInteractor } from './modules/services/use-cases/AddServiceHostsInteractor';
import { RemoveServiceHostsInteractor } from './modules/services/use-cases/RemoveServiceHostsInteractor';
import { ArchiveServiceInteractor } from './modules/services/use-cases/ArchiveServiceInteractor';
import { RestoreServiceInteractor } from './modules/services/use-cases/RestoreServiceInteractor';

export const approvalService = new ApprovalService();
export const authService = new AuthService();
export const checkinService = new CheckinService();
export const credentialService = new CredentialService();
export const departmentService = new DepartmentService();
export const guestService = new GuestService();
export const hostService = new HostService();
export const notificationDomainService = new NotificationDomainService();
export const officeService = new OfficeService();
export const operationsService = new OperationsService();
export const availabilityService = new AvailabilityService();
export const uniFiWebhookService = new UniFiWebhookService();
export const userService = new UserService();
export const visitService = new VisitService();

export const listServicesInteractor = new ListServicesInteractor();
export const createServiceInteractor = new CreateServiceInteractor();
export const updateServiceInteractor = new UpdateServiceInteractor();
export const addServiceHostsInteractor = new AddServiceHostsInteractor();
export const removeServiceHostsInteractor = new RemoveServiceHostsInteractor();
export const archiveServiceInteractor = new ArchiveServiceInteractor();
export const restoreServiceInteractor = new RestoreServiceInteractor();
