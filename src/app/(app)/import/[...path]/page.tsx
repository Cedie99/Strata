import type { Metadata } from "next";
import { Card, DataTable, PageHeader } from "@/components/ui/layout";
import { importSpreadsheet } from "@/modules/import-actions";
import { getImporter } from "@/modules/importers";
import { ImportForm } from "./import-form";

export const metadata: Metadata = { title: "Import from Excel" };

export default async function ImportPage({ params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  const importer = await getImporter(path);

  return (
    <>
      <PageHeader title={`Import ${importer.title.toLowerCase()}`} description="Upload an Excel file. Row 1 holds the column names." />
      <div className="grid max-w-5xl gap-4 px-1 lg:grid-cols-[1fr_22rem]">
        <Card title="Columns">
          <DataTable>
            <thead>
              <tr>
                <th>Column</th>
                <th>Required</th>
                <th>Notes</th>
              </tr>
            </thead>
            <tbody>
              {importer.columns.map((c) => (
                <tr key={c.key}>
                  <td className="font-semibold">{c.label}</td>
                  <td>{c.required ? "Yes" : ""}</td>
                  <td className="whitespace-normal! text-muted">{c.hint}</td>
                </tr>
              ))}
            </tbody>
          </DataTable>
          <p className="mt-3">
            <a href={`/export/${path.join("/")}?template=1`} className="text-primary underline" download>
              Download the template
            </a>{" "}
            and fill it in. Other columns in your file are ignored.
          </p>
        </Card>
        <Card title="Upload">
          <ImportForm action={importSpreadsheet.bind(null, path)} listHref={importer.listHref} />
        </Card>
      </div>
    </>
  );
}
