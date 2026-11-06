import type { Prisma } from "@prisma/client";

type Line = { id: string; debit: Prisma.Decimal; credit: Prisma.Decimal; memo: string; account: { code: string; name: string } };

/** The debit / credit lines of a journal entry, as printed on vouchers ("Accounting entry"). */
export function JournalLines({ lines, money, label = "Accounting entry" }: { lines: Line[]; money: (v: Prisma.Decimal) => string; label?: string }) {
  const sorted = [...lines].sort((a, b) => Number(b.debit.greaterThan(0)) - Number(a.debit.greaterThan(0)));
  const debit = lines.reduce((s, l) => s.plus(l.debit), lines[0]?.debit.mul(0));
  const credit = lines.reduce((s, l) => s.plus(l.credit), lines[0]?.credit.mul(0));
  return (
    <>
      <p className="section-title">{label}</p>
      <table className="lines-table" style={{ marginTop: 4 }}>
        <thead>
          <tr>
            <th>Account</th>
            <th>Memo</th>
            <th className="r">Debit</th>
            <th className="r">Credit</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((l) => (
            <tr key={l.id}>
              <td style={{ paddingLeft: l.credit.greaterThan(0) ? 22 : 6 }}>
                <span className="mono">{l.account.code}</span> {l.account.name}
              </td>
              <td className="muted">{l.memo}</td>
              <td className="r">{l.debit.greaterThan(0) ? money(l.debit) : ""}</td>
              <td className="r">{l.credit.greaterThan(0) ? money(l.credit) : ""}</td>
            </tr>
          ))}
        </tbody>
        {debit && credit && (
          <tfoot>
            <tr>
              <td colSpan={2}>Total</td>
              <td className="r">{money(debit)}</td>
              <td className="r">{money(credit)}</td>
            </tr>
          </tfoot>
        )}
      </table>
    </>
  );
}
