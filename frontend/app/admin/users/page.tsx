import CreateUserForm from '@features/admin/CreateUserForm';
import UserTable from './UserTable';

export default function AdminUsersPage() {
  return (
    <div className="space-y-6">
      <section className="ui-hero">
        <h2 className="text-3xl font-semibold tracking-tight text-white">Manage Users</h2>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-400">
          Create staff accounts, refine role assignments, and keep access ownership aligned with operations.
        </p>
      </section>
      <CreateUserForm />
      <UserTable />
    </div>
  );
}
