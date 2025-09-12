import { CostBreakdown, CostContext, LineItem, Program } from "./costSchema";

function amountFor(item: LineItem, ctx: CostContext): number {
  switch (item.basis) {
    case "fixed":              return item.value;
    case "per_sf":             return item.value * (ctx.buildableSf || 0);
    case "per_unit":           return item.value * (ctx.units || 0);
    case "percent_of_hard":    return item.value * (ctx.hardSubtotalExCont || 0);
    case "percent_of_tdc":     return item.value * (ctx.tdcBeforeFee || 0);
    default:                   return 0;
  }
}

export function computeBreakdown(
  items: LineItem[],
  program: Program
): CostBreakdown {
  // 1) compute the "hard subtotal ex-contingency" first (for % of hard line items)
  //    include HARD + SITE + FEES that are pre-hard, plus amenities, permit/tap etc.
  const preContIds = new Set(["hard_construction","site_work","permit_tap","amenities"]); // add/remove as needed
  let hardSubtotalExCont = 0;
  for (const it of items) {
    if (preContIds.has(it.id)) {
      hardSubtotalExCont += amountFor(it, {
        hardSubtotalExCont: 0,             // not available yet for these base lines
        tdcBeforeFee: 0,
        buildableSf: program.buildableSf,
        units: program.units,
        keys: program.keys,
      });
    }
  }

  // 2) now compute everything with a running tdcBeforeFee (for % of TDC items if you use them)
  let runningBeforeFee = hardSubtotalExCont;
  const outItems: CostBreakdown["items"] = [];

  function push(it: LineItem) {
    const amt = amountFor(it, {
      hardSubtotalExCont,
      tdcBeforeFee: runningBeforeFee,
      buildableSf: program.buildableSf,
      units: program.units,
      keys: program.keys,
    });
    outItems.push({ id: it.id, label: it.label, amount: amt, category: it.category });
    // decide if this contributes to "before fee" (usually everything except a dev fee when you want fee base=hard+soft)
    runningBeforeFee += amt;
  }

  // order matters: compute base hard/site/fees, then softs, then contingency
  const ordered = [
    "hard_construction","site_work","amenities","permit_tap",
    "legal","architecture","civil","survey_env","title_escrow","taxes","insurance",
    "dev_fee","closing_misc","consultants","op_loss","marketing_ffe","misc",
    "contingency"
  ];
  const mapById = new Map(items.map(i => [i.id, i]));
  for (const id of ordered) {
    const it = mapById.get(id);
    if (it) push(it);
  }
  // any other custom items user added:
  for (const it of items) if (!ordered.includes(it.id)) push(it);

  // subtotals
  const subtotals = { HARD:0, SITE:0, FEES:0, SOFT:0, CONT:0, FIN:0 };
  for (const it of outItems) subtotals[it.category] += it.amount;

  // final TDC (if you want interest carry from finance.ts, add it to FIN and subtotal/tdc)
  const tdc = Object.values(subtotals).reduce((s,v)=>s+v,0);

  return { items: outItems, subtotals, tdc };
}