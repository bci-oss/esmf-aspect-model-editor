# Migration of Editor Dialog Forms to Angular Signal Forms

## Context and Problem Statement

The application has begun adopting modern Angular features, including Signal inputs/outputs, `@angular/forms/signals` (`form()`, `FormField`, schema-based validators), and Vitest.
Toolbar modals and standalone dialogs (e.g. `TextModelLoaderModalComponent`, `RenameModelComponent`, `GenerateOpenApiComponent`, etc.) have already been migrated to `@angular/forms/signals`.

However, `core/libs/editor` still contains legacy Angular Reactive Forms (`FormGroup`, `FormControl`, `ReactiveFormsModule`) in the core `editor-dialog` shape configuration hierarchy (`ShapeSettingsComponent`, `ModelElementEditorComponent`, `InputFieldComponent`, `DropdownFieldComponent`, and ~25–30 specialized field components).

## Decision Drivers

* **Unified Paradigm:** Achieve consistency across the entire codebase by utilizing `@angular/forms/signals` everywhere instead of mixing Reactive Forms and Signal Forms.
* **Modern Reactivity:** Leverage fine-grained signal-based dirty checking, valid state computation, and simplified data binding without manual subscription handling or zone dependency.
* **Maintainability & Type Safety:** Signal Forms schema validation aligns directly with TypeScript interfaces and entity data models.

## Considered Options

1. **Keep Reactive Forms in `editor-dialog`**: Leaves dynamic `FormGroup.setControl()` mechanism as-is, but keeps two different form paradigms in the project.
2. **Migrate `editor-dialog` to `@angular/forms/signals` (Chosen)**: Refactor the dynamic polymorphic form architecture to signal models and signal form schemas.

## Decision Outcome

**Chosen Approach:** Option 2 – Migrate `editor-dialog` to `@angular/forms/signals` in a phased, step-by-step manner as an isolated refactoring effort.

### Summary Assessment

| Aspect | Assessment |
| :--- | :--- |
| **Target State** | Migration to `@angular/forms/signals` across `core/libs/editor` for full architectural consistency and signal reactivity. |
| **Effort** | **Medium to High**: Unlike `FormGroup.setControl()`, Signal Forms require structured signal models and schema validation trees. Basis classes (`ModelElementEditorComponent`, `InputFieldComponent`, `DropdownFieldComponent`) and ~25–30 field components plus test suites need migration. |
| **Strategy** | Step-by-step phased execution (Base classes & validators -> Shared/leaf input field components -> Complex sub-entities -> Root ShapeSettings form). |

### Phased Roadmap

1. **Phase 1: Foundation & Validators**
   - Adapt custom validators in `editor-dialog-validators.ts` to support both standard validation rules and `@angular/forms/signals` schema rules.
   - Refactor base field wrappers (`InputFieldComponent`, `DropdownFieldComponent`, `BaseInputComponent`).

2. **Phase 2: Leaf Field Components**
   - Migrate primitive/scalar input field components (`NameInputField`, `DescriptionInputField`, `PreferredNameInputField`, `SeeInputField`, etc.).
   - Update corresponding unit tests.

3. **Phase 3: Complex Characteristic & Constraint Editors**
   - Migrate specialized form groups (`StructuredValueComponent`, `StateCharacteristicComponent`, `TraitCharacteristicComponent`, `ConstraintComponent`).
   - Migrate modal sub-dialogs (`PropertiesModalComponent`, `EntityInstanceModalComponent`).

4. **Phase 4: ShapeSettings Integration & Cleanup**
   - Refactor `ShapeSettingsComponent` and `ModelElementEditorComponent` root form signal.
   - Remove remaining `ReactiveFormsModule` imports from `core/libs/editor`.
   - Ensure all Vitest test suites pass and run end-to-end verification.

