import Link from "next/link";
import { LinkButton } from "@/components/ui/button";
import { Card, DataTable, EmptyRow } from "@/components/ui/layout";
import { can, type CurrentUser } from "@/core/auth/guard";
import { displayValue, showsInList } from "@/modules/custom/fields";
import { lookupLabels, relatedRecords } from "@/modules/custom/lookups";
import { customPermission } from "@/modules/custom/module";

const MAX_COLUMNS = 5;

/**
 * Records of other record types that link to this one through a Lookup field, e.g. an item's
 * U/M conversions or substitutes. Nothing to configure: adding a lookup to this record type is enough.
 */
export async function RelatedLists({ user, entityId, recordId }: { user: CurrentUser; entityId: string; recordId: string }) {
  const related = (await relatedRecords(entityId, recordId)).filter((r) =>
    can(user, customPermission(r.entity.module.slug, "view")),
  );
  if (!related.length) return null;

  return (
    <>
      {await Promise.all(
        related.map(async ({ entity, fields, link, records }) => {
          const base = `/m/${entity.module.slug}/${entity.slug}`;
          const columns = fields.filter((f) => f.key !== link.key && showsInList(f)).slice(0, MAX_COLUMNS);
          const labels = await lookupLabels(columns);
          const canAdd = can(user, customPermission(entity.module.slug, "manage"));
          return (
            <Card key={`${entity.id}:${link.key}`} title={`${entity.name} (${records.length})`}>
              <div className="space-y-2">
                <DataTable>
                  <thead>
                    <tr>
                      {columns.map((c) => (
                        <th key={c.key}>{c.label}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {records.length === 0 && <EmptyRow colSpan={columns.length || 1}>None yet.</EmptyRow>}
                    {records.map((r) => (
                      <tr key={r.id}>
                        {columns.map((c, i) => (
                          <td key={c.key}>
                            {i === 0 ? (
                              <Link href={`${base}/${r.id}`} className="font-medium text-primary hover:underline">
                                {displayValue(c, r.values[c.key], labels.get(c.key))}
                              </Link>
                            ) : (
                              displayValue(c, r.values[c.key], labels.get(c.key))
                            )}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </DataTable>
                {canAdd && (
                  <LinkButton variant="secondary" href={`${base}/new?${new URLSearchParams({ [link.key]: recordId })}`}>
                    Add {entity.name}
                  </LinkButton>
                )}
              </div>
            </Card>
          );
        }),
      )}
    </>
  );
}
