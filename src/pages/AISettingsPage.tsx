import React, { useState } from 'react';
import {
  AIProviderId,
  AISettings,
  PROVIDER_INFO,
  askAI,
  clearAIUsage,
  getAISettings,
  getAIUsage,
  saveAISettings,
  usageTotals,
} from '../lib/ai';
import { AIErrorBox } from '../components/aiCommon';
import { ConfirmModal, Field, useToast } from '../components/ui';
import { formatDate } from '../lib/utils';

/** Maskeert een API-sleutel tot bv. "sk-…af3k". */
function maskKey(key: string): string {
  const k = key.trim();
  if (!k) return '';
  if (k.length <= 8) return '••••••';
  return `${k.slice(0, 3)}…${k.slice(-4)}`;
}

/** Nette getallen in Vlaamse notatie (1 234 567). */
function num(n: number): string {
  return n.toLocaleString('nl-BE');
}

function StatBox({ label, value }: { label: string; value: number }) {
  return (
    <div
      style={{
        flex: '1 1 140px', background: 'var(--bg-sunken)', border: '1px solid var(--line)',
        borderRadius: 'var(--radius-m)', padding: '12px 16px',
      }}
    >
      <div style={{ fontSize: '1.55rem', fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>{num(value)}</div>
      <div className="hint" style={{ marginTop: 2 }}>{label}</div>
    </div>
  );
}

type TestResult = { ok: true; model: string } | { ok: false; error: string };

/**
 * Instellingenpagina voor de AI-assistent: verbinding (aanbieder, sleutel,
 * model), gebruikslog met kostentransparantie, privacy-afspraken en het
 * verwijderen van de sleutel. Alles blijft in de browser van dit toestel.
 */
export function AISettingsPage() {
  const toast = useToast();
  const [saved, setSaved] = useState<AISettings>(() => getAISettings());
  const [form, setForm] = useState<AISettings>(() => getAISettings());
  const [showKey, setShowKey] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [confirm, setConfirm] = useState<null | 'log' | 'key'>(null);
  // dwingt herlezen van het gebruikslog af (na test of wissen)
  const [, setTick] = useState(0);
  const bump = () => setTick((x) => x + 1);

  const providerModels = PROVIDER_INFO[form.provider].models;

  const patch = (p: Partial<AISettings>) => {
    setForm((f) => ({ ...f, ...p }));
    setTestResult(null);
  };

  const switchProvider = (p: AIProviderId) => {
    setForm((f) => ({
      ...f,
      provider: p,
      // per wissel het standaardmodel van die aanbieder; het eerder bewaarde
      // model terughalen als je terugkeert naar je bewaarde aanbieder
      model: p === saved.provider && saved.model ? saved.model : (PROVIDER_INFO[p].models[0]?.id ?? ''),
      baseUrl: p === 'custom' ? (f.baseUrl ?? saved.baseUrl ?? '') : f.baseUrl,
    }));
    setTestResult(null);
  };

  /** Opschonen vóór opslag: trims, standaardmodel als noodoplossing. */
  const normalized = (f: AISettings): AISettings => ({
    provider: f.provider,
    apiKey: f.apiKey.trim(),
    model: f.model.trim() || (PROVIDER_INFO[f.provider].models[0]?.id ?? ''),
    baseUrl: f.provider === 'custom' ? ((f.baseUrl ?? '').trim().replace(/\/+$/, '') || undefined) : undefined,
  });

  const doSave = () => {
    const s = normalized(form);
    saveAISettings(s);
    setSaved(s);
    setForm(s);
    toast('AI-instellingen bewaard op dit toestel', 'ok');
  };

  const doTest = async () => {
    // askAI leest uit de lokale opslag, dus eerst de huidige invoer bewaren
    const s = normalized(form);
    saveAISettings(s);
    setSaved(s);
    setForm(s);
    setTesting(true);
    setTestResult(null);
    try {
      await askAI({ prompt: 'Antwoord met precies: OK', task: 'verbindingstest', maxTokens: 20 });
      setTestResult({ ok: true, model: s.model });
    } catch (e) {
      setTestResult({ ok: false, error: (e as Error).message });
    } finally {
      setTesting(false);
      bump(); // gebruikslog kreeg er mogelijk een regel bij
    }
  };

  const removeKey = () => {
    const s: AISettings = { ...normalized(form), apiKey: '' };
    saveAISettings(s);
    setSaved(s);
    setForm(s);
    setShowKey(false);
    setTestResult(null);
    toast('API-sleutel verwijderd van dit toestel', 'ok');
  };

  const wipeLog = () => {
    clearAIUsage();
    bump();
    toast('Gebruikslog gewist', 'ok');
  };

  const totals = usageTotals();
  const usage = getAIUsage().slice(0, 15);
  const hasSavedKey = saved.apiKey.trim().length > 0;

  return (
    <div className="page" style={{ maxWidth: 760 }}>
      <div className="page-head">
        <div>
          <h1>✨ AI-instellingen</h1>
          <p className="sub">Jouw sleutel, jouw toestel, jouw controle — de AI-assistent werkt pas als jij hem instelt.</p>
        </div>
      </div>

      <div style={{ display: 'grid', gap: 16 }}>
        {/* ── 1. Verbinding ─────────────────────────────────────────────── */}
        <section className="card card-pad">
          <h3 style={{ marginTop: 0 }}>🔑 Verbinding</h3>
          <p style={{ marginTop: 0 }}>
            Je gebruikt je <strong>eigen API-sleutel</strong>; die wordt enkel in de browser van dit
            toestel bewaard. Aanvragen gaan <strong>rechtstreeks van je browser naar de gekozen
            aanbieder</strong> — er zit geen server van WidgetFabriek tussen.
          </p>

          <Field label="Aanbieder">
            <select
              value={form.provider}
              onChange={(e) => switchProvider(e.target.value as AIProviderId)}
            >
              {(Object.keys(PROVIDER_INFO) as AIProviderId[]).map((p) => (
                <option key={p} value={p}>{PROVIDER_INFO[p].name}</option>
              ))}
            </select>
          </Field>

          <Field
            label="API-sleutel"
            hint={hasSavedKey
              ? `Er is al een sleutel bewaard op dit toestel: ${maskKey(saved.apiKey)}`
              : 'Nog geen sleutel bewaard. Plak hier je sleutel en klik op Bewaren.'}
          >
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                type={showKey ? 'text' : 'password'}
                value={form.apiKey}
                onChange={(e) => patch({ apiKey: e.target.value })}
                placeholder={form.provider === 'anthropic' ? 'sk-ant-…' : 'sk-…'}
                autoComplete="off"
                spellCheck={false}
                style={{ flex: 1 }}
                aria-label="API-sleutel"
              />
              <button
                type="button"
                className="btn btn-ghost btn-icon"
                onClick={() => setShowKey((v) => !v)}
                aria-label={showKey ? 'Verberg de API-sleutel' : 'Toon de API-sleutel'}
                aria-pressed={showKey}
                title={showKey ? 'Verberg de API-sleutel' : 'Toon de API-sleutel'}
              >
                <span aria-hidden>{showKey ? '🙈' : '👁️'}</span>
              </button>
            </div>
          </Field>

          {form.provider === 'custom' ? (
            <>
              <Field label="Model" hint="De exacte modelnaam zoals je aanbieder die verwacht.">
                <input
                  type="text"
                  value={form.model}
                  onChange={(e) => patch({ model: e.target.value })}
                  placeholder="bv. meta-llama/llama-3.3-70b-instruct"
                  spellCheck={false}
                />
              </Field>
              <Field
                label="Basisadres (OpenAI-compatibel)"
                hint="Zonder /v1 op het einde — de app vult zelf /v1/chat/completions aan."
              >
                <input
                  type="url"
                  value={form.baseUrl ?? ''}
                  onChange={(e) => patch({ baseUrl: e.target.value })}
                  placeholder="bv. https://openrouter.ai/api"
                  spellCheck={false}
                />
              </Field>
            </>
          ) : (
            <Field label="Model">
              <select value={form.model} onChange={(e) => patch({ model: e.target.value })}>
                {providerModels.map((m) => (
                  <option key={m.id} value={m.id}>{m.label}</option>
                ))}
              </select>
            </Field>
          )}

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <button className="btn btn-primary" onClick={doSave}>Bewaren</button>
            <button
              className="btn"
              onClick={() => { void doTest(); }}
              disabled={testing || !form.apiKey.trim()}
            >
              {testing ? '⏳ Bezig met testen…' : '🔌 Test de verbinding'}
            </button>
          </div>
          <p className="hint" style={{ marginTop: 8, marginBottom: 0 }}>
            De test bewaart eerst je instellingen en stelt daarna één minivraag aan het model.
          </p>

          {testResult && testResult.ok && (
            <div
              role="status"
              style={{
                marginTop: 12, border: '1px solid var(--ok)', background: 'var(--ok-soft)',
                borderRadius: 10, padding: '10px 14px', display: 'flex', gap: 10, alignItems: 'center',
              }}
            >
              <span aria-hidden>✅</span>
              <span>Verbinding werkt (model {testResult.model}).</span>
            </div>
          )}
          {testResult && !testResult.ok && (
            <div style={{ marginTop: 12 }}>
              <AIErrorBox error={testResult.error} onRetry={() => { void doTest(); }} />
            </div>
          )}

          <p className="hint" style={{ marginTop: 14, marginBottom: 0 }}>
            Waar vind ik een sleutel?{' '}
            <a href="https://console.anthropic.com/" target="_blank" rel="noopener noreferrer">
              console.anthropic.com
            </a>{' '}
            (Anthropic) of{' '}
            <a href="https://platform.openai.com/api-keys" target="_blank" rel="noopener noreferrer">
              platform.openai.com/api-keys
            </a>{' '}
            (OpenAI). Je hebt er een account met wat tegoed nodig.
          </p>
        </section>

        {/* ── 2. Gebruik & kosten ───────────────────────────────────────── */}
        <section className="card card-pad">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <h3 style={{ margin: 0, flex: 1 }}>📊 Gebruik &amp; kosten</h3>
            <button
              className="btn btn-sm btn-ghost"
              onClick={() => setConfirm('log')}
              disabled={totals.calls === 0}
            >
              🧹 Log wissen
            </button>
          </div>

          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 14 }}>
            <StatBox label="AI-aanvragen" value={totals.calls} />
            <StatBox label="Invoertokens" value={totals.inputTokens} />
            <StatBox label="Uitvoertokens" value={totals.outputTokens} />
          </div>

          {usage.length === 0 ? (
            <p className="hint" style={{ marginTop: 14, marginBottom: 0 }}>
              Nog geen AI-aanvragen gedaan op dit toestel.
            </p>
          ) : (
            <div className="table-wrap" style={{ marginTop: 14 }}>
              <table className="data">
                <thead>
                  <tr>
                    <th>Datum</th>
                    <th>Taak</th>
                    <th>Model</th>
                    <th style={{ textAlign: 'right' }}>In</th>
                    <th style={{ textAlign: 'right' }}>Uit</th>
                  </tr>
                </thead>
                <tbody>
                  {usage.map((u, i) => (
                    <tr key={`${u.at}-${i}`} style={{ cursor: 'default' }}>
                      <td style={{ whiteSpace: 'nowrap' }}>{formatDate(u.at)}</td>
                      <td>{u.task}</td>
                      <td style={{ whiteSpace: 'nowrap' }}>{u.model}</td>
                      <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{num(u.inputTokens)}</td>
                      <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{num(u.outputTokens)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <p className="hint" style={{ marginTop: 12, marginBottom: 0 }}>
            Tokens bepalen de kostprijs bij je aanbieder; raadpleeg diens prijzenpagina.
            Grote bronteksten = meer tokens. Hierboven zie je de laatste 15 aanvragen.
          </p>
        </section>

        {/* ── 3. Privacy & goed gebruik ─────────────────────────────────── */}
        <section className="card card-pad">
          <h3 style={{ marginTop: 0 }}>🛡️ Privacy &amp; goed gebruik</h3>
          <ul style={{ paddingLeft: 20, margin: 0, display: 'grid', gap: 8 }}>
            <li>
              Je sleutel staat <strong>alleen in deze browser</strong> (localStorage) en verlaat dit
              toestel niet — behalve richting je AI-aanbieder om je aanvragen te ondertekenen.
            </li>
            <li>
              Wat je laat genereren, vertrekt <strong>als tekst naar de gekozen aanbieder</strong>.
              Stuur dus <strong>nooit leerlingnamen of andere leerlinggegevens</strong> mee in
              bronmateriaal of opdrachten.
            </li>
            <li>
              AI-uitvoer is een <strong>voorzet</strong>: jij als leerkracht kijkt alles na en
              beslist wat er met de klas meegaat.
            </li>
            <li>
              De app kent <strong>nergens automatisch punten toe op basis van AI</strong> — scoren
              en beoordelen blijven mensenwerk.
            </li>
          </ul>
        </section>

        {/* ── 4. Sleutel verwijderen ────────────────────────────────────── */}
        <section className="card card-pad">
          <h3 style={{ marginTop: 0 }}>🗑️ Sleutel verwijderen</h3>
          <p style={{ marginTop: 0 }}>
            Verwijder je sleutel van dit toestel — bijvoorbeeld op een gedeelde klascomputer.
            De AI-functies schakelen dan uit tot je opnieuw een sleutel instelt; je aanbieder en
            modelkeuze blijven bewaard.
          </p>
          <button
            className="btn btn-danger"
            onClick={() => setConfirm('key')}
            disabled={!hasSavedKey}
          >
            🗑️ Sleutel verwijderen van dit toestel
          </button>
          {!hasSavedKey && (
            <p className="hint" style={{ marginTop: 8, marginBottom: 0 }}>
              Er is momenteel geen sleutel bewaard.
            </p>
          )}
        </section>
      </div>

      {confirm === 'log' && (
        <ConfirmModal
          title="Gebruikslog wissen?"
          message={`Het logboek met ${num(totals.calls)} AI-aanvragen (tijdstip, taak, model en tokens) wordt definitief van dit toestel verwijderd. Dit heeft geen invloed op de facturatie bij je aanbieder.`}
          confirmLabel="Log wissen"
          onConfirm={wipeLog}
          onClose={() => setConfirm(null)}
        />
      )}
      {confirm === 'key' && (
        <ConfirmModal
          title="API-sleutel verwijderen?"
          message={`De sleutel ${maskKey(saved.apiKey)} wordt van dit toestel verwijderd en de AI-functies schakelen uit. Bij je aanbieder blijft de sleutel gewoon bestaan; daar intrekken doe je op diens website.`}
          confirmLabel="Sleutel verwijderen"
          onConfirm={removeKey}
          onClose={() => setConfirm(null)}
        />
      )}
    </div>
  );
}
