// GST maths for the store. Prices are GST-inclusive, so tax is backed out
// of the price. Work in integer paise to avoid float drift; convert to
// rupees only at the edges (database numeric columns, display).

export function toPaise(rupees: number): number {
  return Math.round(rupees * 100);
}

export function toRupees(paise: number): number {
  return paise / 100;
}

export interface LineTax {
  gross: number; // GST-inclusive line total, paise
  taxable: number; // value before GST, paise
  tax: number; // GST, paise
}

export function lineTax(unitPricePaise: number, gstRate: number, qty: number): LineTax {
  const gross = unitPricePaise * qty;
  const taxable = Math.round((gross * 100) / (100 + gstRate));
  return { gross, taxable, tax: gross - taxable };
}

export interface TaxLineInput {
  unitPricePaise: number;
  gstRate: number;
  qty: number;
}

export interface OrderTotals {
  taxable: number;
  tax: number;
  total: number;
}

export function orderTotals(lines: readonly TaxLineInput[]): OrderTotals {
  return lines
    .map((l) => lineTax(l.unitPricePaise, l.gstRate, l.qty))
    .reduce(
      (acc, l) => ({ taxable: acc.taxable + l.taxable, tax: acc.tax + l.tax, total: acc.total + l.gross }),
      { taxable: 0, tax: 0, total: 0 },
    );
}

export interface TaxSplit {
  cgst: number;
  sgst: number;
  igst: number;
}

const normalizeState = (state: string) => state.trim().toLowerCase();

/**
 * Intra-state supply: CGST + SGST (half each). Inter-state: IGST.
 * Without a configured seller state we cannot tell, so IGST is shown.
 */
export function splitTax(taxPaise: number, sellerState: string | null, buyerState: string): TaxSplit {
  if (sellerState && normalizeState(sellerState) === normalizeState(buyerState)) {
    const cgst = Math.ceil(taxPaise / 2);
    return { cgst, sgst: taxPaise - cgst, igst: 0 };
  }
  return { cgst: 0, sgst: 0, igst: taxPaise };
}
