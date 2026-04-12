# Layer Responsibilities

This project uses a layered architecture, but the most important rule is not just where files live. The important rule is where business decisions live.

## Command Handlers

Command handlers in `src/commands/` are the Telegram-facing application boundary.

They are expected to:

- receive Telegram input (`message`, `callback_query`, `ctx.match`, `ctx.from`)
- validate command-specific entry conditions
- perform command-specific permission and ownership checks
- parse and normalize raw user input into DTO-like data for services
- call one or more services
- choose the user-facing response path (`reply`, `answerCallbackQuery`, wizard step, preview update)
- trigger presentation updates such as synchronized ride message refreshes

They are not expected to own reusable business rules.

Command handlers should not:

- decide business side effects based on ride state transitions
- encode notification policies
- encode attached-group membership rules
- duplicate participation, ride-state, or sharing rules across handlers
- perform direct storage orchestration when a service can own the use case

## Services

Services in `src/services/` own business use cases and cross-entity coordination.

They are expected to:

- encapsulate ride and participation business rules
- coordinate storage mutations
- decide what happens when a state transition occurs
- delegate infrastructure work to narrower collaborator services when needed
- return structured outcomes that handlers can map to user-facing messages

Examples of service-owned decisions:

- whether a participation change is allowed
- whether a repeated participation action is a no-op
- whether a participation transition should trigger creator notifications
- whether a participation transition should add or remove a user from an attached group

## Supporting Layers

Some project components support a specific layer and should stay focused on that role:

- `src/telegram/TelegramGateway.js` is the Telegram transport boundary
- `src/wizard/` owns interactive UI flow state and step navigation
- `src/formatters/` owns rendering of user-visible ride content
- `src/utils/` contains helpers and parsing utilities, not business orchestration

## Practical Rule

If a piece of logic would need to be reused from another command, callback, wizard path, import flow, or future automation, it probably does not belong in a command handler.

If a handler starts making decisions like "when state changes from X to Y, also do Z", that logic should usually move into a service dedicated to that use case.

## Current Refactoring Direction

This rule is especially relevant for participation flows. The handler should translate Telegram input into a participation request and communicate the result back to the user. The service layer should own participation transition rules such as notifications and attached-group synchronization.
