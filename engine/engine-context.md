# Kufu Engine - Context

# What is Kufu Engine?

Kufu Engine is the orchestration layer for Kufu.

Its purpose is to explore whether multiple constrained local language models can cooperate to perform small software engineering tasks more effectively than a single identical model.

Kufu is not trying to compete with large cloud models.

The research question is:

> Can several small local models, each with a narrowly defined responsibility and structured communication, outperform a single local model on practical coding tasks?

The Engine coordinates this process.

---

# Research Mantra

A small model does not need to become smarter.

It needs:

- a small responsibility,
- carefully filtered context,
- and a strict enough interface so another small model can continue the work without losing important information.

Complexity should come from system design, not from larger prompts.

---

# Core Philosophy

## Human Supervision

Kufu is not autonomous.

The developer remains part of the loop.

Kufu proposes.

The developer reviews.

The developer decides.

---

## Small Responsibilities

Each model should solve exactly one problem.

Responsibilities should not overlap.

A model should not plan, implement and review simultaneously.

---

## Structured Communication

Natural language between agents should be minimized.

Structured outputs should be preferred whenever possible.

Interfaces are considered first-class components of the system.

---

## Deterministic Systems First

If a problem can be solved deterministically, it should not require an LLM.

Examples:

- listing files,
- reading directories,
- JSON validation,
- event generation,
- IPC,
- repository traversal.

LLMs should be reserved for ambiguous reasoning tasks.

---

# Agent Responsibilities

Each agent answers exactly one question.

## Planner

Question:

What should happen?

Receives:

- user request,
- repository constraints,
- relevant context.

Produces:

- executable implementation task.

The planner never writes code.

---

## Implementer

Question:

How should it happen?

Receives:

- planner task,
- implementation context.

Produces:

- code modifications.

The implementer never creates new plans.

---

## Future Reviewer

Question:

Was the plan executed as expected?

Receives:

- planner task,
- implementation result.

Produces:

- findings,
- inconsistencies,
- possible issues.

The reviewer should evaluate implementation quality.

The reviewer should not rewrite code.

---

# MVP Pipeline

Current objective:

User

↓

Planner

↓

ONE TASK

↓

Implementer

↓

Human

The MVP should remain intentionally small.

Single task.

Single file.

Single implementation.

Human evaluation.

---

# Planned Evolution

MVP

Planner → Implementer

If stable:

MVP-1

Add Reviewer.

If stable:

MVP-2

Support multiple files.

If stable:

MVP-3

Introduce Context Builder.

If stable:

MVP-4

Experiment with dynamic pipelines.

Complexity should only be introduced after previous stages are validated.

---

# Planner Task Contract

Initial proposal:

```ts
interface PlannerTask {
  id: string;

  file: string;

  action: "CREATE" | "UPDATE" | "DELETE";

  target: string;

  description: string;

  dependencies: string[];
}
```

The planner should prefer precise implementation requirements over abstract descriptions.

Example:

Good:

Create function validateJwt.

Bad:

Improve authentication.

---

# Implementation Context

The implementer should receive only the information required to complete the task.

Initial context package:

Task

-

Target file

-

Neighbor functions

-

Imported modules

-

Relevant helper snippets

Large repository dumps should be avoided.

Minimal useful context is preferred.

---

# Context Retrieval

Context generation should be hybrid.

Deterministic systems should:

- discover repository structure,
- list files,
- collect metadata.

LLMs may:

- identify relevant files,
- filter useful information,
- summarize context.

The objective is not perfect context.

The objective is useful context.

---

# Research Questions

The Engine should help answer practical questions.

Examples:

Does separating responsibilities improve output quality?

How many effective interactions can a small model sustain before quality degrades?

Does reasoning improve implementation quality enough to justify additional latency?

Does structured communication reduce hallucinations?

How much context is actually necessary?

Which responsibilities benefit from reasoning?

---

# Thinking Experiments

Thinking should be treated as an experimental variable.

Possible experiments:

Implementer:

Thinking ON

vs

Thinking OFF

Measure:

- latency,
- output quality,
- context consumption.

Assumptions should be validated experimentally.

---

# Benchmarks

As the project evolves, useful metrics include:

Quality

Did the implementation work?

Latency

How long did the pipeline take?

Context Consumption

How much context was used?

Context Endurance

How many useful interactions can a model sustain?

Hallucination Rate

Did the model invent missing information?

Single Model Comparison

Can the pipeline outperform a single identical local model?

Benchmarks should remain practical and easy to reproduce.

---

# Development Guidelines

Keep iterations small.

Prefer experiments over assumptions.

Avoid premature optimization.

Avoid unnecessary infrastructure.

Avoid adding agents without measurable benefit.

A simpler pipeline that works is preferred over a sophisticated pipeline that cannot be validated.

Every feature should support the central research question.

When uncertain:

Reduce responsibility.

Reduce context.

Strengthen interfaces.
