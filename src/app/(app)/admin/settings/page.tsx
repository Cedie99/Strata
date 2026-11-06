import type { Metadata } from "next";
import { ActionForm, SubmitButton, TextAreaField, TextField } from "@/components/ui/form";
import { Card, PageHeader } from "@/components/ui/layout";
import { requirePermission } from "@/core/auth/guard";
import { getSettings } from "@/core/settings";
import { saveSettings } from "@/modules/admin/actions";
import { P } from "@/modules/admin/module";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  await requirePermission(P.settingsManage);
  const settings = await getSettings();

  return (
    <>
      <PageHeader title="Company settings" />
      <Card className="max-w-2xl">
        <ActionForm action={saveSettings}>
          <TextField
            name="app.name"
            label="System name"
            defaultValue={settings["app.name"]}
            hint="Shown in the title bar"
            required
          />
          <TextField name="company.name" label="Company name" defaultValue={settings["company.name"]} required />
          <TextField
            name="company.currency"
            label="Currency"
            defaultValue={settings["company.currency"]}
            hint="3-letter code, e.g. PHP, USD"
            maxLength={3}
            required
          />
          <TextAreaField name="company.address" label="Address" defaultValue={settings["company.address"]} />
          <SubmitButton>Save settings</SubmitButton>
        </ActionForm>
      </Card>
    </>
  );
}
