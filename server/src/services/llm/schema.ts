import { z } from 'zod';

const fieldSchema = <T extends z.ZodTypeAny>(valueType: T) =>
  z.object({
    value: valueType.nullable(),
    confidence: z.number().min(0).max(1)
  });

export const fdrExtractionSchema = z.object({
  fdrNumber: fieldSchema(z.string()),
  bankName: fieldSchema(z.string()),
  branch: fieldSchema(z.string()),
  amount: fieldSchema(z.number().positive()),
  issueDate: fieldSchema(z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD')),
  maturityDate: fieldSchema(z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD')),
  depositorName: fieldSchema(z.string()),
  lienInFavourOfAicte: fieldSchema(z.boolean())
}).strict();

export type FdrExtractionOutput = z.infer<typeof fdrExtractionSchema>;

/**
 * Strict JSON schema conforming to Groq / OpenAI Structured Outputs
 */
export const FDR_EXTRACTION_JSON_SCHEMA = {
  name: "fdr_extraction",
  strict: true,
  schema: {
    type: "object",
    properties: {
      fdrNumber: {
        type: "object",
        properties: {
          value: { type: ["string", "null"] },
          confidence: { type: "number" }
        },
        required: ["value", "confidence"],
        additionalProperties: false
      },
      bankName: {
        type: "object",
        properties: {
          value: { type: ["string", "null"] },
          confidence: { type: "number" }
        },
        required: ["value", "confidence"],
        additionalProperties: false
      },
      branch: {
        type: "object",
        properties: {
          value: { type: ["string", "null"] },
          confidence: { type: "number" }
        },
        required: ["value", "confidence"],
        additionalProperties: false
      },
      amount: {
        type: "object",
        properties: {
          value: { type: ["number", "null"] },
          confidence: { type: "number" }
        },
        required: ["value", "confidence"],
        additionalProperties: false
      },
      issueDate: {
        type: "object",
        properties: {
          value: { type: ["string", "null"] },
          confidence: { type: "number" }
        },
        required: ["value", "confidence"],
        additionalProperties: false
      },
      maturityDate: {
        type: "object",
        properties: {
          value: { type: ["string", "null"] },
          confidence: { type: "number" }
        },
        required: ["value", "confidence"],
        additionalProperties: false
      },
      depositorName: {
        type: "object",
        properties: {
          value: { type: ["string", "null"] },
          confidence: { type: "number" }
        },
        required: ["value", "confidence"],
        additionalProperties: false
      },
      lienInFavourOfAicte: {
        type: "object",
        properties: {
          value: { type: ["boolean", "null"] },
          confidence: { type: "number" }
        },
        required: ["value", "confidence"],
        additionalProperties: false
      }
    },
    required: [
      "fdrNumber",
      "bankName",
      "branch",
      "amount",
      "issueDate",
      "maturityDate",
      "depositorName",
      "lienInFavourOfAicte"
    ],
    additionalProperties: false
  }
};
