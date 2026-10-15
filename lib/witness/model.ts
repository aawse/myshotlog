import type { PhotoAsset } from "../photos/schema";
import { z } from "../validation";
import { sessionSchema, resultSchema, type Session } from "../models";
import { disciplineIds } from "../disciplines";
import { sessionSetup } from "../session-setup";
const {
  photoId: _photoId,
  conditionsConfirmed: _conditions,
  evidence: _evidence,
  ...reviewResultFields
} = resultSchema.shape;
export const reviewSchema = z
  .object({
    sessionId: z.uuid(),
    date: z.string(),
    time: z.string(),
    location: z.string().max(200),
    discipline: z.enum(disciplineIds),
    program: z.string().max(120),
    ruleReference: z.string().max(200).optional(),
    group: z.string().max(100),
    context: z.enum(["practice", "competition"]),
    firearm: z
      .object({
        make: z.string().max(100),
        model: z.string().max(100),
        caliber: z.string().max(60),
        hasOptic: z.boolean().optional(),
      })
      .strict()
      .nullable(),
    results: z.array(z.object(reviewResultFields).strict()).min(1).max(100),
  })
  .strict();
export type WitnessReview = z.infer<typeof reviewSchema>;
export const signatureSchema = z
  .object({
    mediaType: z.literal("image/png"),
    width: z.number().int().min(1).max(800),
    height: z.number().int().min(1).max(300),
    data: z
      .string()
      .max(140000)
      .regex(/^[A-Za-z0-9+/]+={0,2}$/),
  })
  .strict();
export const witnessSchema = z
  .object({
    version: z.literal(1),
    id: z.uuid(),
    sessionId: z.uuid(),
    resultId: z.uuid().nullable(),
    name: z.string().trim().min(1).max(120),
    signedAt: z.iso.datetime(),
    statementVersion: z.literal(1),
    statementLanguage: z.enum(["sv", "en"]),
    statement: z.string().min(1).max(1000),
    digest: z.string().regex(/^[a-f0-9]{64}$/),
    snapshot: reviewSchema,
    signature: signatureSchema,
  })
  .strict()
  .superRefine((value, ctx) => {
    if (
      value.snapshot.sessionId !== value.sessionId ||
      (value.resultId &&
        (value.snapshot.results.length !== 1 ||
          value.snapshot.results[0].id !== value.resultId))
    )
      ctx.addIssue({ code: "custom", message: "Invalid witness scope" });
  });
export type WitnessSignoff = z.infer<typeof witnessSchema>;
export const invitationSchema = z
  .object({
    version: z.literal(1),
    id: z.uuid(),
    sessionId: z.uuid(),
    resultId: z.uuid().nullable(),
    tokenHash: z.string().regex(/^[a-f0-9]{64}$/),
    digest: z.string().regex(/^[a-f0-9]{64}$/),
    snapshot: reviewSchema,
    createdAt: z.iso.datetime(),
    expiresAt: z.iso.datetime(),
    status: z.enum(["pending", "cancelled", "signed"]),
  })
  .strict();
export function reviewSession(
  input: Session,
  resultId: string | null,
): WitnessReview {
  const session = sessionSetup(sessionSchema.parse(input));
  const results = resultId
    ? session.results.filter((r) => r.id === resultId)
    : session.results;
  if (!results.length) throw new Error("WITNESS_UNAVAILABLE");
  return reviewSchema.parse({
    sessionId: session.id,
    date: session.date,
    time: session.time,
    location: session.location,
    discipline: session.discipline,
    program: session.program,
    ...(session.ruleReference ? { ruleReference: session.ruleReference } : {}),
    group: session.group,
    context: session.context,
    firearm: session.firearmSnapshot
      ? {
          make: session.firearmSnapshot.make,
          model: session.firearmSnapshot.model,
          caliber: session.firearmSnapshot.caliber,
          ...(session.firearmSnapshot.hasOptic !== undefined
            ? { hasOptic: session.firearmSnapshot.hasOptic }
            : {}),
        }
      : null,
    results: results.map((r) => {
      const {
        photoId: _photo,
        evidence: _evidence,
        conditionsConfirmed: _confirmed,
        ...raw
      } = r;
      return {
        ...raw,
        ...(session.distance != null ? { distance: session.distance } : {}),
        ...(session.target ? { target: session.target } : {}),
        ...(session.seconds != null ? { seconds: session.seconds } : {}),
        ...(r.stageDistance !== undefined
          ? {
              distance:
                r.stageDistance * (r.stageDistanceUnit === "yd" ? 0.9144 : 1),
            }
          : {}),
        ...(r.stageTimeLimit !== undefined
          ? { seconds: r.stageTimeLimit }
          : {}),
        ...(r.stageTarget !== undefined ? { target: r.stageTarget } : {}),
      };
    }),
  });
}
export function witnessCurrent(signoff: WitnessSignoff, session: Session) {
  try {
    return (
      JSON.stringify(signoff.snapshot) ===
      JSON.stringify(reviewSession(session, signoff.resultId))
    );
  } catch {
    return false;
  }
}

export type WitnessPhoto = Pick<
  PhotoAsset,
  "mediaType" | "width" | "height" | "data"
>;
