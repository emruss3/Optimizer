import { LineItem } from "./costSchema";

export const DEFAULT_LINE_ITEMS: LineItem[] = [
  // HARD & SITE & PERMITS
  { id:"hard_construction", label:"Hard Construction Costs & Demo", basis:"per_sf", value:275, category:"HARD" },
  { id:"site_work",         label:"Site Work",                       basis:"fixed", value:300_000, category:"SITE" },
  { id:"permit_tap",        label:"Permit & Tap Fees",               basis:"per_unit", value:3_500, category:"FEES" },
  { id:"amenities",         label:"Amenities",                       basis:"per_sf", value:15, category:"HARD" },

  // SOFT COSTS (detail)
  { id:"legal",             label:"Legal",                           basis:"fixed", value:65_000, category:"SOFT" },
  { id:"architecture",      label:"Architecture",                    basis:"percent_of_hard", value:0.035, category:"SOFT" },
  { id:"civil",             label:"Civil Engineer",                  basis:"fixed", value:85_000, category:"SOFT" },
  { id:"survey_env",        label:"Survey & Environmental",          basis:"fixed", value:45_000, category:"SOFT" },
  { id:"title_escrow",      label:"Title & Escrow",                  basis:"fixed", value:30_000, category:"SOFT" },
  { id:"taxes",             label:"Real Estate Taxes (pre-CO)",      basis:"fixed", value:40_000, category:"SOFT" },
  { id:"insurance",         label:"Insurance",                        basis:"fixed", value:55_000, category:"SOFT" },
  { id:"dev_fee",           label:"Development Fee",                 basis:"percent_of_hard", value:0.04, category:"SOFT" },
  { id:"closing_misc",      label:"Closing Cost & Fees",             basis:"fixed", value:25_000, category:"SOFT" },
  { id:"consultants",       label:"Consultants & Pro Fees",          basis:"fixed", value:60_000, category:"SOFT" },
  { id:"op_loss",           label:"Op Loss",                         basis:"fixed", value:50_000, category:"SOFT" },
  { id:"marketing_ffe",     label:"Marketing & FF&E",                basis:"per_unit", value:2_500, category:"SOFT" },
  { id:"misc",              label:"Misc",                            basis:"fixed", value:25_000, category:"SOFT" },

  // CONTINGENCY (as % of hard)
  { id:"contingency",       label:"Contingency",                     basis:"percent_of_hard", value:0.07, category:"CONT" },
];