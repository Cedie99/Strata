"use client";

import { useState } from "react";
import type { ActionState } from "@/core/forms";
import { ActionForm, SelectField, SubmitButton, TextField } from "@/components/ui/form";

export function ItemClassForm({
  action,
  itemTypes,
  parents,
  values,
}: {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
  /** Active item types (plus the class's own, if it was retired since). */
  itemTypes: { id: string; name: string }[];
  /** Classes this one may sit under, labelled with their full path. */
  parents: { id: string; itemTypeId: string; path: string }[];
  values?: { itemTypeId: string; parentId: string | null; description: string; editing: boolean };
}) {
  const [itemType, setItemType] = useState(values?.itemTypeId ?? "");
  const [parentId, setParentId] = useState(values?.parentId ?? "");
  // A subclass always takes its parent's item type, and the type is fixed once the class exists.
  const typeFixed = !!values?.editing || !!parentId;

  return (
    <ActionForm action={action}>
      <SelectField
        name="itemTypeId_shown"
        label="Item type"
        value={itemType}
        onChange={(e) => {
          setItemType(e.target.value);
          setParentId("");
        }}
        disabled={typeFixed}
        options={[{ value: "", label: "Choose…" }, ...itemTypes.map((t) => ({ value: t.id, label: t.name }))]}
        hint={values?.editing ? "Fixed after creation." : parentId ? "Taken from the parent class." : undefined}
        required
      />
      <input type="hidden" name="itemTypeId" value={itemType} />
      <SelectField
        name="parentId"
        label="Parent class"
        value={parentId}
        onChange={(e) => {
          setParentId(e.target.value);
          const parent = parents.find((p) => p.id === e.target.value);
          if (parent) setItemType(parent.itemTypeId);
        }}
        options={[
          { value: "", label: "— None (top level under the item type) —" },
          ...parents.filter((p) => !itemType || p.itemTypeId === itemType).map((p) => ({ value: p.id, label: p.path })),
        ]}
      />
      <TextField
        name="description"
        label="Description"
        defaultValue={values?.description}
        maxLength={100}
        hint="Saved in capitals, e.g. DEGREASER."
        required
        autoFocus
      />
      <SubmitButton>Save item class</SubmitButton>
    </ActionForm>
  );
}
