// tests/schema.test.ts
import { expect, test } from "bun:test";
import { PlannerTaskSchema, plannerTaskJsonSchema, FileActionSchema } from "../src/schema.ts";

test("FileActionSchema accepts the three known actions", () => {
  const allowed = ["CREATE", "UPDATE", "DELETE"] as const;
  for (const a of allowed) {
    expect(FileActionSchema.parse(a)).toBe(a);
  }
});

test("FileActionSchema rejects unknown actions", () => {
  expect(() => FileActionSchema.parse("REWRITE")).toThrow();
});

test("PlannerTaskSchema accepts a minimal valid task", () => {
  const t = PlannerTaskSchema.parse({
    task: "A landing page with a hero section and a footer.",
    preferredOutcome: "card.astro",
    requiredFiles: [],
    action: "CREATE",
  });
  expect(t.requiredFiles).toEqual([]);
  expect(t.action).toBe("CREATE");
});

test("PlannerTaskSchema rejects missing required fields", () => {
  expect(() =>
    PlannerTaskSchema.parse({
      task: "x",
      preferredOutcome: "y",
      action: "CREATE",
    } as unknown),
  ).toThrow();
});

test("PlannerTaskSchema rejects bad action", () => {
  expect(() =>
    PlannerTaskSchema.parse({
      task: "x",
      preferredOutcome: "y",
      requiredFiles: [],
      action: "REWRITE",
    }),
  ).toThrow();
});

test("plannerTaskJsonSchema returns a JSON-schema-shaped object", () => {
  const js = plannerTaskJsonSchema();
  expect(js.type).toBe("object");
  const props = js.properties as Record<string, { type?: string; enum?: string[] }>;
  expect(props.task.type).toBe("string");
  expect(props.action.enum).toEqual(["CREATE", "UPDATE", "DELETE"]);
  expect(js.required).toContain("preferredOutcome");
});
