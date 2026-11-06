import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Card, listTabs, PageHeader, Tabs } from "@/components/ui/layout";
import { requirePermission } from "@/core/auth/guard";
import { db } from "@/core/db";
import Link from "next/link";
import { ConfirmSubmitButton } from "@/components/ui/confirm-dialog";
import { ActionForm } from "@/components/ui/form";
import { deleteRole, saveRole } from "@/modules/admin/actions";
import { P } from "@/modules/admin/module";
import { getModules } from "@/modules/registry";
import { RoleForm } from "../role-form";

export const metadata: Metadata = { title: "Role" };

export default async function RolePage({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission(P.rolesManage);
  const { id } = await params;
  const role = await db.role.findUnique({
    where: { id },
    include: { permissions: true, users: { include: { user: { select: { id: true, name: true } } } } },
  });
  if (!role) notFound();

  return (
    <>
      <PageHeader title={role.name} description={role.description} />
      <Tabs tabs={listTabs("/admin/roles", true)} />
      <div className="space-y-4">
        <Card>
          <RoleForm
            action={saveRole.bind(null, id)}
            modules={await getModules()}
            locked={role.isSystem}
            values={{
              name: role.name,
              description: role.description,
              permissions: role.permissions.map((p) => p.permission),
            }}
          />
        </Card>
        {!role.isSystem && (
          <Card title="Delete role" className="max-w-3xl">
            {role.users.length > 0 ? (
              <div className="space-y-2">
                <p>
                  This role is assigned to <span className="font-semibold">{role.users.length} user(s)</span>, so it
                  cannot be deleted yet. Remove it from them first (open each user and untick the role):
                </p>
                <ul className="flex flex-wrap gap-2">
                  {role.users.map(({ user }) => (
                    <li key={user.id}>
                      <Link href={`/admin/users/${user.id}`} className="text-primary">
                        {user.name}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <ActionForm action={deleteRole.bind(null, id)}>
                <p className="text-muted">
                  Nobody has this role. Deleting it cannot be undone; the audit log keeps a copy of its name and
                  permissions.
                </p>
                <ConfirmSubmitButton label="Delete role" title="Delete this role?" items={[role.name]}>
                  Nobody has this role. This cannot be undone; the audit log keeps its name and permissions.
                </ConfirmSubmitButton>
              </ActionForm>
            )}
          </Card>
        )}
      </div>
    </>
  );
}
