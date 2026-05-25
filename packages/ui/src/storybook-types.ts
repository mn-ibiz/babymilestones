/**
 * Minimal Component Story Format (CSF) type shims (X7-S02).
 *
 * The primitives ship Storybook entries (AC3) authored in standard CSF. To keep
 * `@bm/ui` free of the heavy Storybook runtime as a hard dependency, the `Meta`
 * / `StoryObj` types are declared locally here. They are structurally
 * compatible with `@storybook/react`, so when a Storybook host (the docs app or
 * the design surface) imports these `*.stories.tsx` files they resolve exactly
 * as Storybook expects — the local types just let the stories typecheck inside
 * this package's own gate without the dependency.
 */
import type * as React from "react";

export interface Meta<TComponent> {
  title?: string;
  component: TComponent;
  args?: TComponent extends React.ComponentType<infer P> ? Partial<P> : never;
  argTypes?: Record<string, unknown>;
  parameters?: Record<string, unknown>;
  tags?: string[];
}

export interface StoryObj<TMeta> {
  args?: TMeta extends Meta<infer C>
    ? C extends React.ComponentType<infer P>
      ? Partial<P>
      : Record<string, unknown>
    : Record<string, unknown>;
  render?: () => React.ReactElement;
  name?: string;
}
