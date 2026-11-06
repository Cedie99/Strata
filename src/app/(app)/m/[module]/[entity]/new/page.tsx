import type { Metadata } from "next";
import { Card, PageHeader, recordTabs, Tabs } from "@/components/ui/layout";
import { saveRecord } from "@/modules/custom/actions";
import { defaultInput, NO_DEFAULT, NOT_TYPED, type RecordData } from "@/modules/custom/fields";
import { lineGridsFor } from "@/modules/custom/lines";
import { lookupChoices } from "@/modules/custom/lookups";
import { requireCustomEntity } from "@/modules/custom/queries";
import { RecordForm } from "../record-form";

export const metadata: Metadata = { title: "New record" };

export default async function NewRecordPage({
  params,
  searchParams,
}: {
  params: Promise<{ module: string; entity: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ module, entity: entitySlug }, preset] = await Promise.all([params, searchParams]);
  const { user, entity, fields } = await requireCustomEntity(module, entitySlug, "manage");
  // Defaults are worked out here so "today" means the server's day, the same one used when saving.
  const defaults: RecordData = Object.fromEntries(
    fields
      .filter((f) => f.defaultValue && !NO_DEFAULT.includes(f.type))
      .map((f) => {
        const value = defaultInput(f);
        return [f.key, f.type === "checkbox" ? value === "on" : value];
      }),
  );
  // "Add" on a related list opens this page with the parent filled in, e.g. ?item=<record id>.
  for (const f of fields) {
    const v = preset[f.key];
    if (typeof v === "string" && !NOT_TYPED.includes(f.type)) defaults[f.key] = v;
  }
  return (
    <>
      <PageHeader title={`New · ${entity.name}`} />
      <Tabs tabs={recordTabs(`/m/${module}/${entitySlug}`, null, "general")} />
      <Card className="max-w-4xl">
        <RecordForm
          action={saveRecord.bind(null, entity.id, null)}
          fields={fields}
          values={defaults}
          choices={await lookupChoices(fields)}
          layout={entity.formLayout === "tabs" ? "tabs" : "sections"}
          lineGrids={await lineGridsFor(user, entity.id, null)}
        />
      </Card>
    </>
  );
}
