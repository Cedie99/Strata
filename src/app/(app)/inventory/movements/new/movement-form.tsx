"use client";

import { useState } from "react";
import { ActionForm, SelectField, SubmitButton, TextAreaField, TextField } from "@/components/ui/form";
import { postMovement } from "@/modules/inventory/actions";

type Option = { value: string; label: string };

const TYPE_OPTIONS: Option[] = [
  { value: "RECEIPT", label: "Receipt (stock in)" },
  { value: "ISSUE", label: "Issue (stock out)" },
  { value: "TRANSFER", label: "Transfer between warehouses" },
  { value: "ADJUSTMENT", label: "Adjustment (+ or −)" },
];

export function MovementForm({
  products,
  warehouses,
  productId,
}: {
  products: Option[];
  warehouses: Option[];
  productId?: string;
}) {
  const [type, setType] = useState("RECEIPT");
  const placeholder = (label: string) => [{ value: "", label }];

  return (
    <ActionForm action={postMovement}>
      <SelectField name="type" label="Type" options={TYPE_OPTIONS} value={type} onChange={(e) => setType(e.target.value)} />
      <SelectField
        name="productId"
        label="Product"
        options={[...placeholder("Choose a product…"), ...products]}
        defaultValue={productId ?? ""}
        required
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField
          name="warehouseId"
          label={type === "TRANSFER" ? "From warehouse" : "Warehouse"}
          options={[...placeholder("Choose…"), ...warehouses]}
          defaultValue=""
          required
        />
        {type === "TRANSFER" && (
          <SelectField
            name="toWarehouseId"
            label="To warehouse"
            options={[...placeholder("Choose…"), ...warehouses]}
            defaultValue=""
            required
          />
        )}
      </div>
      <TextField
        name="qty"
        label="Quantity"
        inputMode="decimal"
        required
        hint={type === "ADJUSTMENT" ? "Use a negative number to reduce stock, e.g. -5" : undefined}
      />
      <TextField
        name="reference"
        label="Reference"
        hint={type === "RECEIPT" ? "e.g. PO-1001, DR-552. Use OPENING for opening stock (books it to opening balance equity, not payables)" : "e.g. PO-1001, DR-552"}
      />
      <TextAreaField name="note" label="Note" />
      <SubmitButton>Post movement</SubmitButton>
    </ActionForm>
  );
}
