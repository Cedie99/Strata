import "server-only";
import { Prisma, type Branch } from "@prisma/client";
import { getBranchScope } from "@/core/branches";
import { db } from "@/core/db";
import { formatDateTime, formatMoney, formatQty } from "@/core/format";
import {
  applyColumnFilters,
  dateCell,
  dayBound,
  filterGrid,
  finishGrid,
  GRID_PAGE_SIZE,
  optionsOf,
  type ColumnCondition,
  type ColumnFilter,
  type FilterDef,
  type GridColumn,
  type GridFilter,
  type GridList,
  type GridQuery,
} from "@/core/grid";
import { getSettings } from "@/core/settings";
import { getStockLevels } from "./queries";

// The inventory list screens. Each builds the grid for a query; with `all` it skips paging,
// which is how the Excel export reuses exactly what the user sees. Callers check permissions.
// In-memory lists: search/letter/panel filters (filterGrid) → rows → column filters + paging (finishGrid).

type Opts = { all?: boolean };
const num = (d: Prisma.Decimal) => Number(d.toString());

const ACTIVE_OPTIONS = [
  { value: "active", label: "Active" },
  { value: "inactive", label: "Inactive" },
];
const branchOptions = (branches: Branch[]) => branches.map((b) => ({ value: b.id, label: `${b.code} · ${b.name}` }));

export async function productList(query: GridQuery, { all }: Opts = {}): Promise<GridList> {
  const scope = await getBranchScope();
  const [products, levels, settings] = await Promise.all([
    db.product.findMany({ orderBy: { name: "asc" } }),
    getStockLevels({ branchIds: scope.ids }),
    getSettings(),
  ]);
  type P = (typeof products)[number];
  const totals = new Map<string, number>();
  for (const l of levels) totals.set(l.productId, (totals.get(l.productId) ?? 0) + num(l.qty));
  const currency = settings["company.currency"];
  const onHandOf = (p: P) => totals.get(p.id) ?? 0;
  const stockState = (p: P) => (onHandOf(p) <= 0 ? "out" : onHandOf(p) <= num(p.reorderLevel) ? "low" : "ok");

  const filters: FilterDef<P>[] = [
    {
      key: "status",
      label: "Status",
      type: "select",
      options: ACTIVE_OPTIONS,
      get: (p) => (p.isActive ? "active" : "inactive"),
    },
    {
      key: "stock",
      label: "Stock level",
      type: "select",
      options: [
        { value: "low", label: "Low (at or below reorder level)" },
        { value: "out", label: "Out of stock" },
        { value: "ok", label: "Above reorder level" },
      ],
      get: stockState,
    },
    { key: "unit", label: "Unit", type: "select", options: optionsOf(products, (p) => p.unit), get: (p) => p.unit },
  ];
  const matched = filterGrid(products, query, {
    text: (p) => `${p.sku} ${p.name} ${p.description}`,
    first: (p) => p.name,
    filters,
    all: true,
  });
  const columns: GridColumn[] = [
    { key: "name", label: "Name" },
    { key: "sku", label: "SKU", mono: true },
    { key: "unit", label: "Unit" },
    { key: "cost", label: "Cost", align: "right" },
    { key: "price", label: "Price", align: "right" },
    { key: "onHand", label: scope.current ? `On hand (${scope.current.code})` : "On hand", align: "right" },
    { key: "reorder", label: "Reorder level", align: "right" },
    { key: "status", label: "Status", kind: "status" },
  ];
  const rows = matched.rows.map((p) => {
    const onHand = onHandOf(p);
    const low = p.isActive && onHand <= num(p.reorderLevel);
    return {
      id: p.id,
      href: `/inventory/products/${p.id}`,
      cells: {
        name: p.name,
        sku: p.sku,
        unit: p.unit,
        cost: { text: formatMoney(p.cost, currency), value: num(p.cost) },
        price: { text: formatMoney(p.price, currency), value: num(p.price) },
        onHand: {
          text: formatQty(onHand),
          tone: low ? ("danger" as const) : undefined,
          hint: low ? "LOW" : undefined,
          value: onHand,
        },
        reorder: { text: formatQty(p.reorderLevel), value: num(p.reorderLevel) },
        status: p.isActive ? "Active" : { text: "Inactive", tone: "muted" as const },
      },
    };
  });
  return finishGrid(rows, columns, query, { all, filters: matched.filters });
}

export async function warehouseList(query: GridQuery, { all, editable = true }: Opts & { editable?: boolean } = {}) {
  const scope = await getBranchScope();
  const warehouses = await db.warehouse.findMany({
    where: { branchId: { in: scope.ids } },
    orderBy: { code: "asc" },
    include: { branch: true },
  });
  const filters: FilterDef<(typeof warehouses)[number]>[] = [
    { key: "branch", label: "Branch", type: "select", options: branchOptions(scope.allowed), get: (w) => w.branchId },
    {
      key: "status",
      label: "Status",
      type: "select",
      options: ACTIVE_OPTIONS,
      get: (w) => (w.isActive ? "active" : "inactive"),
    },
  ];
  const matched = filterGrid(warehouses, query, {
    text: (w) => `${w.code} ${w.name} ${w.address} ${w.branch.code} ${w.branch.name}`,
    first: (w) => w.name,
    filters,
    all: true,
  });
  const columns: GridColumn[] = [
    { key: "created", label: "Date Created", kind: "date" },
    { key: "name", label: "Name" },
    { key: "code", label: "Code", mono: true },
    { key: "branch", label: "Branch" },
    { key: "address", label: "Address" },
    { key: "status", label: "Status", kind: "status" },
  ];
  const rows = matched.rows.map((w) => ({
    id: w.id,
    href: editable ? `/inventory/warehouses/${w.id}` : undefined,
    cells: {
      created: dateCell(w.createdAt, formatDateTime),
      name: w.name,
      code: w.code,
      branch: `${w.branch.code} · ${w.branch.name}`,
      address: w.address || "-",
      status: w.isActive ? "Active" : { text: "Inactive", tone: "muted" as const },
    },
  }));
  return finishGrid(rows, columns, query, { all, filters: matched.filters });
}

export async function stockList(
  query: GridQuery,
  { all }: Opts = {},
): Promise<GridList & { totalValue: Prisma.Decimal }> {
  const scope = await getBranchScope();
  const [levels, products, warehouses, settings] = await Promise.all([
    getStockLevels({ branchIds: scope.ids }),
    db.product.findMany(),
    db.warehouse.findMany({ include: { branch: true } }),
    getSettings(),
  ]);
  const productById = new Map(products.map((p) => [p.id, p]));
  const warehouseById = new Map(warehouses.map((w) => [w.id, w]));
  const currency = settings["company.currency"];

  const levelsFull = levels
    .map((l) => ({ ...l, product: productById.get(l.productId)!, warehouse: warehouseById.get(l.warehouseId)! }))
    .sort((a, b) => a.product.name.localeCompare(b.product.name) || a.warehouse.code.localeCompare(b.warehouse.code));
  type L = (typeof levelsFull)[number];
  const filters: FilterDef<L>[] = [
    {
      key: "branch",
      label: "Branch",
      type: "select",
      options: branchOptions(scope.allowed),
      get: (r) => r.warehouse.branchId,
    },
    {
      key: "warehouse",
      label: "Warehouse",
      type: "select",
      options: [...new Map(levelsFull.map((r) => [r.warehouseId, `${r.warehouse.code} · ${r.warehouse.name}`]))]
        .map(([value, label]) => ({ value, label }))
        .sort((a, b) => a.label.localeCompare(b.label)),
      get: (r) => r.warehouseId,
    },
    {
      key: "stock",
      label: "Stock level",
      type: "select",
      options: [
        { value: "low", label: "Low (at or below reorder level)" },
        { value: "ok", label: "Above reorder level" },
      ],
      get: (r) => (r.qty.lte(r.product.reorderLevel) ? "low" : "ok"),
    },
  ];
  const matched = filterGrid(levelsFull, query, {
    text: (r) =>
      `${r.product.sku} ${r.product.name} ${r.warehouse.code} ${r.warehouse.name} ${r.warehouse.branch.code}`,
    first: (r) => r.product.name,
    filters,
    all: true,
  });
  const columns: GridColumn[] = [
    { key: "product", label: "Product" },
    { key: "sku", label: "SKU", mono: true },
    { key: "branch", label: "Branch" },
    { key: "warehouse", label: "Warehouse" },
    { key: "onHand", label: "On hand", align: "right" },
    { key: "unit", label: "Unit" },
    { key: "value", label: "Value at cost", align: "right" },
  ];
  const rows = matched.rows.map((r) => {
    const low = r.qty.lte(r.product.reorderLevel);
    const value = r.qty.times(r.product.cost);
    return {
      id: `${r.productId}-${r.warehouseId}`,
      href: `/inventory/products/${r.productId}`,
      cells: {
        product: r.product.name,
        sku: r.product.sku,
        branch: r.warehouse.branch.code,
        warehouse: `${r.warehouse.code} · ${r.warehouse.name}`,
        onHand: {
          text: formatQty(r.qty),
          tone: low ? ("danger" as const) : undefined,
          hint: low ? "LOW" : undefined,
          value: num(r.qty),
        },
        unit: r.product.unit,
        value: { text: formatMoney(value, currency), value: num(value) },
      },
    };
  });
  const list = finishGrid(rows, columns, query, { all, filters: matched.filters });
  // The header total follows the search and every filter, e.g. "value of low stock in MNL".
  const totalValue = applyColumnFilters(rows, columns, query).reduce((sum, r) => {
    const cell = r.cells.value;
    return sum.plus(typeof cell === "object" && typeof cell.value === "number" ? cell.value : 0);
  }, new Prisma.Decimal(0));
  return { ...list, totalValue };
}

const MOVEMENT_TYPES = ["RECEIPT", "ISSUE", "ADJUSTMENT", "TRANSFER_IN", "TRANSFER_OUT"];

// Column filters of the ledger, translated to database conditions (the ledger is filtered in SQL).
type Where = Prisma.StockMovementWhereInput;
const textField: Record<string, (c: Prisma.StringFilter) => Where> = {
  number: (c) => ({ number: c }),
  type: (c) => ({ type: c }),
  sku: (c) => ({ product: { sku: c } }),
  product: (c) => ({ product: { name: c } }),
  branch: (c) => ({ warehouse: { branch: { code: c } } }),
  warehouse: (c) => ({ warehouse: { code: c } }),
  reference: (c) => ({ reference: c }),
  by: (c) => ({ createdBy: { name: c } }),
};

function movementCondition(key: string, { op, value }: ColumnCondition): Where | undefined {
  const mode = "insensitive" as const;
  if (key === "qty") {
    if (op === "empty") return { id: "" };
    if (op === "nempty") return {};
    const n = Number(value.replace(/,/g, ""));
    if (Number.isNaN(n)) return undefined;
    // The column shows signed quantities (+20,000 / −30), and so does the filter.
    const map = { eq: { equals: n }, neq: { not: n }, gt: { gt: n }, gte: { gte: n }, lt: { lt: n }, lte: { lte: n } };
    return op in map ? { qty: map[op as keyof typeof map] } : undefined;
  }
  if (key === "when") {
    if (op === "empty") return { id: "" };
    if (op === "nempty") return {};
    const start = dayBound(value, false);
    const end = dayBound(value, true);
    if (!start || !end) return undefined;
    const map = {
      eq: { gte: start, lt: end },
      gt: { gte: end },
      gte: { gte: start },
      lt: { lt: start },
      lte: { lt: end },
    };
    if (op === "neq") return { OR: [{ createdAt: { lt: start } }, { createdAt: { gte: end } }] };
    return op in map ? { createdAt: map[op as keyof typeof map] } : undefined;
  }
  const field = textField[key];
  if (!field) return undefined;
  switch (op) {
    case "eq":
      return field({ equals: value, mode });
    case "neq":
      return { NOT: field({ equals: value, mode }) };
    case "contains":
      return field({ contains: value, mode });
    case "ncontains":
      return { NOT: field({ contains: value, mode }) };
    case "starts":
      return field({ startsWith: value, mode });
    case "ends":
      return field({ endsWith: value, mode });
    case "empty":
      return key === "number" || key === "reference" ? field({ equals: "" }) : { id: "" };
    case "nempty":
      return key === "number" || key === "reference" ? { NOT: field({ equals: "" }) } : {};
    default:
      return undefined;
  }
}

function movementColumnWhere(columns: Record<string, ColumnFilter>): Where[] {
  return Object.entries(columns).flatMap(([key, f]) => {
    const a = movementCondition(key, f.a);
    const b = f.b && movementCondition(key, f.b);
    if (!a) return [];
    if (!b) return [a];
    return [f.join === "or" ? { OR: [a, b] } : { AND: [a, b] }];
  });
}

/**
 * The ledger grows without limit, so it is searched, filtered and paged in the database.
 * Exports cap at 100,000 rows.
 */
export async function movementList(query: GridQuery, { all }: Opts = {}): Promise<GridList> {
  const scope = await getBranchScope();
  const f = query.filters;
  const like = (value: string) => ({ contains: value, mode: "insensitive" as const });
  const [warehouses, users] = await Promise.all([
    db.warehouse.findMany({ where: { branchId: { in: scope.ids } }, orderBy: { code: "asc" } }),
    db.user.findMany({
      where: { stockMovements: { some: {} } },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);
  const branchIds = f.f_branch && scope.ids.includes(f.f_branch) ? [f.f_branch] : scope.ids;
  const from = dayBound(f.f_date_from, false);
  const to = dayBound(f.f_date_to, true);

  const where: Where = {
    warehouse: { branchId: { in: branchIds } },
    ...(f.f_warehouse && { warehouseId: f.f_warehouse }),
    ...(f.f_type && { type: f.f_type }),
    ...(f.f_by && { createdById: f.f_by }),
    ...((from || to) && { createdAt: { ...(from && { gte: from }), ...(to && { lt: to }) } }),
    ...(f.f_direction === "in" && { qty: { gt: 0 } }),
    ...(f.f_direction === "out" && { qty: { lt: 0 } }),
    AND: [
      ...(query.q
        ? [
            {
              OR: [
                { number: like(query.q) },
                { reference: like(query.q) },
                { type: like(query.q) },
                { product: { OR: [{ sku: like(query.q) }, { name: like(query.q) }] } },
                { warehouse: { code: like(query.q) } },
              ],
            },
          ]
        : []),
      ...movementColumnWhere(query.columns),
    ],
  };
  const filters: GridFilter[] = [
    { key: "date", label: "Date", type: "date" },
    {
      key: "type",
      label: "Type",
      type: "select",
      options: MOVEMENT_TYPES.map((t) => ({ value: t, label: t.replace("_", " ") })),
    },
    {
      key: "direction",
      label: "Direction",
      type: "select",
      options: [
        { value: "in", label: "Stock in (+)" },
        { value: "out", label: "Stock out (−)" },
      ],
    },
    { key: "branch", label: "Branch", type: "select", options: branchOptions(scope.allowed) },
    {
      key: "warehouse",
      label: "Warehouse",
      type: "select",
      options: warehouses.map((w) => ({ value: w.id, label: `${w.code} · ${w.name}` })),
    },
    { key: "by", label: "Posted by", type: "select", options: users.map((u) => ({ value: u.id, label: u.name })) },
  ];

  const [movements, total] = await Promise.all([
    db.stockMovement.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: all ? 0 : (query.page - 1) * GRID_PAGE_SIZE,
      take: all ? 100_000 : GRID_PAGE_SIZE,
      include: { product: true, warehouse: { include: { branch: true } }, createdBy: { select: { name: true } } },
    }),
    db.stockMovement.count({ where }),
  ]);

  return {
    query,
    total,
    filters,
    columns: [
      { key: "when", label: "Date Created", kind: "date" },
      { key: "number", label: "Number", mono: true },
      { key: "type", label: "Type" },
      { key: "sku", label: "SKU", mono: true },
      { key: "product", label: "Product" },
      { key: "branch", label: "Branch" },
      { key: "warehouse", label: "Warehouse" },
      { key: "qty", label: "Qty", align: "right" },
      { key: "reference", label: "Reference" },
      { key: "by", label: "By" },
    ],
    rows: movements.map((m) => ({
      id: m.id,
      cells: {
        when: dateCell(m.createdAt, formatDateTime),
        number: m.number || "-",
        type: m.type,
        sku: m.product.sku,
        product: m.product.name,
        branch: m.warehouse.branch.code,
        warehouse: m.warehouse.code,
        qty: {
          text: `${m.qty.isNegative() ? "" : "+"}${formatQty(m.qty)}`,
          tone: m.qty.isNegative() ? "danger" : "ok",
          value: num(m.qty),
        },
        reference: m.reference || "-",
        by: m.createdBy?.name ?? "-",
      },
    })),
  };
}
