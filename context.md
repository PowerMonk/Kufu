# Kufu - Context

## What is Kufu?

Kufu is an experimental local-first coding assistant designed to explore whether multiple small language models can cooperate to solve software engineering tasks.

The project is NOT trying to replace large cloud models.

The primary research question is:

> Can several constrained local models, coordinated through deterministic interfaces, produce useful software engineering results?

Kufu is intentionally designed around small local models with limited context windows.

---

# Project Philosophy

Kufu is built around a few principles.

## Human Supervision

Kufu is not autonomous.

The developer is always part of the loop.

Kufu proposes.

The developer reviews.

The developer decides.

---

## Small Tasks

Large software projects should be decomposed into very small executable units.

Bad:

- Build frontend.
- Build authentication.

Good:

- Create login component.
- Add JWT middleware.
- Add pricing card.

Small context windows are a feature, not a bug.

---

## Deterministic Interfaces

Agents should communicate through structured outputs.

Natural language between agents should be minimized.

JSON schemas and strict contracts are preferred.

The engine should validate outputs whenever possible.

---

## Cognitive Roles

Agents are separated by responsibility, not by software domain.

Current roles:

Planner

- Reads the user request.
- Produces executable tasks.
- Never writes code.

Implementer

- Receives one task.
- Writes or modifies code.
- Never plans.

Reviewer

- Reviews generated work.
- Produces findings.
- Never rewrites code.

Future roles should follow the same philosophy.

---

# Project Structure

```
kufu/

README.md

tui/
    Cargo.toml
    src/

engine/
    package.json
    src/
```

The TUI and Engine are separate projects.

---

# TUI

Language:

Rust

Purpose:

Render the state of the system.

The TUI should not contain business logic.

The TUI should not know about LLM internals.

The TUI receives events and updates the interface.

Rust is currently new to the developer.

Helpful and concise comments explaining Rust-specific concepts are encouraged.

Avoid unnecessary abstractions.

Clarity is preferred over optimization, but optimize only when it REALLY adds a performance or benefit.

Clear comments on clever code sections are a MUST.

---

# Engine

Language:

TypeScript

Purpose:

Coordinate the agent pipeline.

The Engine owns:

- Planner
- Implementer
- Reviewer
- LLM communication
- JSON validation
- Event generation

The Engine should not know about terminal rendering.

---

# IPC

Communication between Engine and TUI should remain simple.

Preferred approach:

stdin/stdout with JSON messages.

Example:

{
"event": "planner_started"
}

The TUI renders events.

The Engine emits events.

Keep both systems loosely coupled.

---

# Current Pipeline

1.

Prompt received.

↓

TASK_ACCEPTED.

↓

Planner starts.

↓

Planner generates structured tasks.

↓

Task dispatched.

↓

Implementer executes.

↓

Code streams.

↓

Reviewer starts.

↓

Reviewer validates.

↓

Verdict generated.

↓

Human reviews output.

---

# Initial Event Model

Possible events:

TASK_ACCEPTED

PROMPT_RECEIVED

PLANNER_STARTED

PLANNER_FINISHED

TASK_DISPATCHED

IMPLEMENTER_STARTED

IMPLEMENTER_WORKING

CODE_STREAM

IMPLEMENTER_FINISHED

REVIEWER_STARTED

REVIEWER_FINISHED

PIPELINE_COMPLETED

PIPELINE_FAILED

Future events should extend this model.

---

# Structured Outputs

The first iteration should heavily prefer JSON.

Planner outputs structured tasks.

Implementer outputs structured code results.

Reviewer outputs structured findings.

The engine validates outputs before continuing.

The goal is to reduce ambiguity.

---

# Development Guidelines

Keep iterations small.

Prefer working prototypes over large rewrites.

Do not introduce complex infrastructure prematurely.

Avoid unnecessary frameworks.

Avoid adding memory systems, vector databases, distributed messaging systems, or autonomous behavior unless there is a demonstrated need.

Every new feature should support the central research question.

---

# Educational Goal

Kufu is both a software project and a learning project.

The developer is actively learning Rust.

When generating Rust code:

- prefer idiomatic patterns,
- include concise educational comments,
- explain ownership or borrowing when non-obvious,
- avoid advanced patterns unless necessary.

The goal is long-term understanding, not simply generating working code.

---

# Definition of Success

Kufu v1 does not need to replace commercial coding agents.

Kufu succeeds if it can reliably execute small software engineering tasks through a deterministic Planner → Implementer → Reviewer pipeline using local language models while providing a transparent and understandable developer experience.
