'use client';

import { useState } from 'react';
import {
  APP_CATEGORIES,
  hasErrors,
  validateCreateApp,
  type AppCategory,
  type CreateAppInput,
} from '@a-testers/shared';
import { createApp, errorFields, errorMessage } from '@/lib/callables';

const BLANK: CreateAppInput = {
  name: '',
  packageName: '',
  shortDescription: '',
  category: 'productivity',
  playTestUrl: '',
  googleGroupUrl: '',
  seatsRequested: 12,
};

/**
 * Validation runs client-side from the same `validateCreateApp` the callable uses, so the
 * inline errors and the server's rejection can never disagree.
 */
export function CreateAppForm({ onCreated }: { onCreated: () => void }) {
  const [values, setValues] = useState<CreateAppInput>(BLANK);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const set = <K extends keyof CreateAppInput>(key: K, v: CreateAppInput[K]) => {
    setValues((prev) => ({ ...prev, [key]: v }));
    setErrors((prev) => {
      if (!prev[key as string]) return prev;
      const next = { ...prev };
      delete next[key as string];
      return next;
    });
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const local = validateCreateApp(values);
    if (hasErrors(local)) {
      setErrors(local as Record<string, string>);
      return;
    }

    setBusy(true);
    try {
      await createApp(values);
      setValues(BLANK);
      setErrors({});
      onCreated();
    } catch (err) {
      const fields = errorFields(err);
      if (fields) setErrors(fields);
      else setFormError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={(e) => void onSubmit(e)} className="card space-y-4 p-5">
      <div>
        <h2 className="font-medium">List an app</h2>
        <p className="mt-1 text-sm muted">
          It starts as a draft. You open it to testers once you have a seat to spend.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="App name" error={errors.name}>
          <input
            className="field"
            value={values.name}
            onChange={(e) => set('name', e.target.value)}
            placeholder="Habit Garden"
          />
        </Field>

        <Field label="Package name" error={errors.packageName} hint="From your build.gradle">
          <input
            className="field font-mono"
            value={values.packageName}
            onChange={(e) => set('packageName', e.target.value)}
            placeholder="com.example.habitgarden"
          />
        </Field>
      </div>

      <Field label="Short description" error={errors.shortDescription}>
        <textarea
          className="field resize-none"
          rows={2}
          maxLength={280}
          value={values.shortDescription}
          onChange={(e) => set('shortDescription', e.target.value)}
          placeholder="What your app does, and what you would most like feedback on."
        />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Category" error={errors.category}>
          <select
            className="field capitalize"
            value={values.category}
            onChange={(e) => set('category', e.target.value as AppCategory)}
          >
            {APP_CATEGORIES.map((c) => (
              <option key={c} value={c} className="capitalize">
                {c}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Testers wanted" error={errors.seatsRequested} hint="Google requires 12">
          <input
            type="number"
            min={1}
            max={50}
            className="field"
            value={values.seatsRequested ?? 12}
            onChange={(e) => set('seatsRequested', Number(e.target.value))}
          />
        </Field>
      </div>

      <Field
        label="Closed-test opt-in link"
        error={errors.playTestUrl}
        hint="Play Console → Testing → Closed testing → Testers → Copy link"
      >
        <input
          className="field"
          value={values.playTestUrl}
          onChange={(e) => set('playTestUrl', e.target.value)}
          placeholder="https://play.google.com/apps/testing/com.example.habitgarden"
        />
      </Field>

      <Field
        label="Google Group link"
        error={errors.googleGroupUrl}
        hint="Testers must join this before the opt-in link works"
      >
        <input
          className="field"
          value={values.googleGroupUrl}
          onChange={(e) => set('googleGroupUrl', e.target.value)}
          placeholder="https://groups.google.com/g/habitgarden-testers"
        />
      </Field>

      {formError && <p className="text-sm text-danger-400">{formError}</p>}

      <button type="submit" disabled={busy} className="btn-primary w-full">
        {busy ? 'Creating…' : 'Create draft listing'}
      </button>
    </form>
  );
}

function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-sm font-medium">{label}</span>
      {hint && !error && <span className="ml-2 text-xs muted">{hint}</span>}
      <div className="mt-1.5">{children}</div>
      {error && <span className="mt-1 block text-xs text-danger-400">{error}</span>}
    </label>
  );
}
