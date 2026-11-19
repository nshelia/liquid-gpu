/**
 * Form showcase: a sign-up form (SwiftUI Form look = insetGrouped List) with json-render-style `checks`.
 * Open `/form.html` (`?dark`, `?mode=blur|change`). Registers `window.__form` (the FormStore) for scripts.
 */
import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { LiquidRoot, NavigationStack, Screen, ScrollView } from '@liquid-gpu/react';
import {
  Form,
  FormSection,
  SecureFieldRow,
  SliderRow,
  StepperRow,
  SubmitButton,
  TextFieldRow,
  ToggleRow,
  useCreateFormStore,
  type FormValues,
  type ValidationMode,
} from '../../../../packages/react/src/form';

const q = new URLSearchParams(location.search);
const mode = (q.get('mode') as ValidationMode | null) ?? 'submit';

const TAKEN = new Set(['admin', 'root', 'nika']);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function SignUp() {
  const store = useCreateFormStore();
  const [done, setDone] = useState<FormValues | null>(null);
  useEffect(() => {
    (window as unknown as Record<string, unknown>).__form = store;
    document.documentElement.dataset.ready = '1';
  }, [store]);

  return (
    <Screen title="Create Account" largeTitle>
      <ScrollView aria-label="Sign up">
        <Form
          store={store}
          mode={mode}
          aria-label="Sign up"
          initialValues={{ newsletter: true }}
          validators={{
            // Async check, referenced by name so the spec stays JSON.
            usernameFree: async (v) => {
              await sleep(400);
              return TAKEN.has(String(v).toLowerCase()) ? 'That username is taken.' : true;
            },
          }}
          onSubmit={async (values) => {
            await sleep(1200); // pretend network
            setDone(values);
          }}
        >
          <FormSection header="Profile">
            <TextFieldRow name="name" label="Name" placeholder="Required" autoComplete="name" checks={[{ type: 'required' }]} />
            <TextFieldRow
              name="username"
              label="Username"
              placeholder="Required"
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              helpText="Letters, numbers and underscores."
              checks={[
                { type: 'required' },
                { type: 'minLength', value: 3 },
                { type: 'pattern', value: '^[A-Za-z0-9_]+$', message: 'Use letters, numbers and underscores only.' },
                { type: 'custom', name: 'usernameFree' },
              ]}
            />
            <TextFieldRow
              name="email"
              label="Email"
              type="email"
              inputMode="email"
              autoComplete="email"
              autoCapitalize="none"
              placeholder="name@example.com"
              checks={[{ type: 'required' }, { type: 'email' }]}
            />
            <TextFieldRow name="website" label="Website" type="url" placeholder="Optional" checks={[{ type: 'url' }]} />
          </FormSection>

          <FormSection header="Security" footer="Use at least 8 characters.">
            <SecureFieldRow
              name="password"
              label="Password"
              labelStyle="placeholder"
              autoComplete="new-password"
              checks={[{ type: 'required' }, { type: 'minLength', value: 8 }]}
            />
            <SecureFieldRow
              name="confirm"
              label="Confirm Password"
              labelStyle="placeholder"
              autoComplete="new-password"
              checks={[{ type: 'required' }, { type: 'matches', value: 'password', message: 'Passwords don’t match.' }]}
            />
          </FormSection>

          <FormSection header="Preferences">
            <StepperRow name="age" label="Age" min={13} max={120} defaultValue={18} checks={[{ type: 'min', value: 16, message: 'You must be 16 or older.' }]} />
            <SliderRow name="volume" label="Notification Volume" showLabel min={0} max={1} defaultValue={0.5} format={(v) => `${Math.round(v * 100)}%`} />
            <ToggleRow name="newsletter" label="Newsletter" />
          </FormSection>

          <FormSection footer="You can delete your account at any time in Settings.">
            <ToggleRow name="terms" label="Accept Terms" checks={[{ type: 'required', message: 'Accept the terms to continue.' }]} />
          </FormSection>

          <SubmitButton>Create Account</SubmitButton>

          {done && (
            <FormSection header="Submitted">
              <pre style={{ margin: 0, padding: '12px 20px', fontSize: 13, whiteSpace: 'pre-wrap', color: 'var(--lq-secondary-label)' }}>
                {JSON.stringify(done, null, 2)}
              </pre>
            </FormSection>
          )}
        </Form>
      </ScrollView>
    </Screen>
  );
}

function Page() {
  return (
    <LiquidRoot appearance={q.has('dark') ? 'dark' : 'light'} safeArea={{ top: 62, bottom: 34 }}>
      <NavigationStack root={<SignUp />} />
    </LiquidRoot>
  );
}

export function mount(el: HTMLElement): void {
  createRoot(el).render(
    <StrictMode>
      <Page />
    </StrictMode>,
  );
}
