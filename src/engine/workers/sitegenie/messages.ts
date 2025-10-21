import { z } from "zod";

export const PolygonSchema = z.object({
  type: z.literal("Polygon"),
  coordinates: z.array(z.array(z.tuple([z.number(), z.number()]))).min(1),
});

export const GenerateReq = z.object({
  type: z.literal("generate"),
  reqId: z.string(),
  parcel: PolygonSchema,
  config: z.record(z.any()).default({}),
  metrics: z.object({
    areaSqft: z.number().positive(),
    bbox: z.tuple([z.number(), z.number(), z.number(), z.number()]),
    perimeterFeet: z.number().positive(),
  }).optional(),
});

export type GenerateReq = z.infer<typeof GenerateReq>;
