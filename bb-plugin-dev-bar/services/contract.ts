import { defineRpcContract } from "@get-bb/plugin-sdk";
import { z } from "zod";
import { SERVICE_STATES, SERVICE_VERBS } from "./manifest";

const threadInput = z.object({ threadId: z.string() }).strict();

const serviceSchema = z.object({
  id: z.string(),
  label: z.string(),
  state: z.enum(SERVICE_STATES),
  url: z.string().nullable(),
  message: z.string().nullable(),
  verbs: z.array(z.enum(SERVICE_VERBS)),
});

const failureSchema = z.object({
  /** What was being done, such as "Start Vite" or "Status". */
  title: z.string(),
  command: z.string(),
  /** The last lines of what the command printed, or why it could not run. */
  output: z.string(),
});

const stripSchema = z.discriminatedUnion("kind", [
  /** The thread has no local checkout, or its checkout has no manifest. */
  z.object({ kind: z.literal("none") }),
  z.object({
    kind: z.literal("services"),
    services: z.array(serviceSchema),
    actions: z.array(z.object({ index: z.number(), label: z.string(), confirm: z.string().nullable() })),
    /** Where the manifest came from, said on hover. */
    source: z.string(),
    /** Set when the manifest or the status command failed. */
    failure: failureSchema.nullable(),
  }),
]);

const runInput = z
  .object({
    threadId: z.string(),
    target: z.discriminatedUnion("kind", [
      z.object({ kind: z.literal("service"), id: z.string(), verb: z.enum(SERVICE_VERBS) }).strict(),
      z.object({ kind: z.literal("action"), index: z.number().int().min(0) }).strict(),
    ]),
  })
  .strict();

export const rpcContract = defineRpcContract({
  strip: { input: threadInput, output: stripSchema },
  run: {
    input: runInput,
    output: z.object({ failure: failureSchema.nullable() }),
  },
  /** Starts a thread in the same checkout to fix a failure. */
  startThread: {
    input: z.object({ threadId: z.string(), failure: failureSchema }).strict(),
    output: z.object({ threadId: z.string() }),
  },
});

export type Strip = z.infer<typeof stripSchema>;
export type StripService = z.infer<typeof serviceSchema>;
export type StripAction = Extract<Strip, { kind: "services" }>["actions"][number];
export type Failure = z.infer<typeof failureSchema>;
export type RunTarget = z.infer<typeof runInput>["target"];
