'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import type { Trade, TradeInput, NotionSchema } from '@/lib/types';
import { X, Trash2, Save, Upload, Loader2 } from 'lucide-react';

const DAY_FROM_DATE = (date: string): string => {
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const [y, m, d] = date.split('-').map(Number);
  return days[new Date(y, m - 1, d).getDay()];
};

function getOpts(schema: NotionSchema, key: string): string[] {
  return schema[key]?.map((o) => o.name) ?? [];
}

const EMPTY_FORM: TradeInput = {
  date: new Date().toISOString().slice(0, 10),
  day: [],
  time: '',
  tookTrade: [],
  indices: [],
  longShort: [],
  news: [],
  reversalContinuation: [],
  drawInLiquidity: [],
  poi: [],
  lowerTimeEntry: [],
  rulesFeelings: [],
  trend: [],
  biasForTheDay: [],
  rateTrade: [],
  winLose: [],
  pnl: null,
  notes: '',
  tradeIdeaLink: null,
  oneMTradeLink: null,
};

function tradeToInput(t: Trade): TradeInput {
  return {
    date: t.date,
    day: t.day,
    time: t.time,
    tookTrade: t.tookTrade,
    indices: t.indices,
    longShort: t.longShort,
    news: t.news,
    reversalContinuation: t.reversalContinuation,
    drawInLiquidity: t.drawInLiquidity,
    poi: t.poi,
    lowerTimeEntry: t.lowerTimeEntry,
    rulesFeelings: t.rulesFeelings,
    trend: t.trend,
    biasForTheDay: t.biasForTheDay,
    rateTrade: t.rateTrade,
    winLose: t.winLose,
    pnl: t.pnl,
    notes: t.notes,
    tradeIdeaLink: t.tradeIdeaLink,
    oneMTradeLink: t.oneMTradeLink,
  };
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontSize: 9,
        fontWeight: 700,
        textTransform: 'uppercase',
        letterSpacing: '0.14em',
        color: 'var(--text-muted)',
        paddingBottom: 10,
        borderBottom: '1px solid var(--border-color)',
        marginBottom: 14,
      }}
    >
      {children}
    </div>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.09em', color: 'var(--text-muted)', marginBottom: 7 }}>
      {children}
    </div>
  );
}

function ChipGroup({
  options,
  selected,
  onChange,
  color = 'var(--blue)',
  single = false,
}: {
  options: string[];
  selected: string[];
  onChange: (v: string[]) => void;
  color?: string;
  single?: boolean;
}) {
  const toggle = useCallback(
    (opt: string) => {
      if (single) {
        onChange(selected[0] === opt ? [] : [opt]);
      } else {
        onChange(selected.includes(opt) ? selected.filter((v) => v !== opt) : [...selected, opt]);
      }
    },
    [selected, onChange, single],
  );

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
      {options.map((opt) => {
        const active = selected.includes(opt);
        return (
          <button
            key={opt}
            type="button"
            onClick={() => toggle(opt)}
            style={{
              padding: '4px 10px',
              borderRadius: 999,
              fontSize: 11,
              fontWeight: active ? 600 : 400,
              background: active ? `color-mix(in srgb, ${color} 16%, var(--bg-elevated))` : 'var(--bg-elevated)',
              color: active ? color : 'var(--text-secondary)',
              border: `1px solid ${active ? `color-mix(in srgb, ${color} 32%, transparent)` : 'var(--border-color)'}`,
              cursor: 'pointer',
              transition: 'all 140ms cubic-bezier(0.23, 1, 0.32, 1)',
              outline: 'none',
            }}
          >
            {opt}
          </button>
        );
      })}
    </div>
  );
}

function BigToggle({
  options,
  selected,
  onChange,
}: {
  options: { value: string; label: string; color: string }[];
  selected: string[];
  onChange: (v: string[]) => void;
}) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${options.length}, 1fr)`, gap: 6 }}>
      {options.map(({ value, label, color }) => {
        const active = selected.includes(value);
        return (
          <button
            key={value}
            type="button"
            onClick={() => onChange(active ? [] : [value])}
            style={{
              padding: '9px 12px',
              borderRadius: 10,
              fontSize: 12,
              fontWeight: 700,
              letterSpacing: '0.04em',
              textTransform: 'uppercase',
              background: active ? `color-mix(in srgb, ${color} 14%, var(--bg-surface))` : 'var(--bg-surface)',
              color: active ? color : 'var(--text-muted)',
              border: `1.5px solid ${active ? `color-mix(in srgb, ${color} 35%, transparent)` : 'var(--border-color)'}`,
              cursor: 'pointer',
              transition: 'all 150ms cubic-bezier(0.23, 1, 0.32, 1)',
              boxShadow: active ? `inset 0 1px 0 rgba(255,255,255,0.04)` : 'none',
            }}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

function TextInput({
  value,
  onChange,
  placeholder,
  type = 'text',
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      style={{
        width: '100%',
        padding: '9px 12px',
        borderRadius: 10,
        fontSize: 13,
        background: 'var(--bg-surface)',
        border: '1px solid var(--border-color)',
        color: 'var(--text-primary)',
        outline: 'none',
        transition: 'border-color 150ms',
        fontFamily: 'inherit',
        boxSizing: 'border-box',
      }}
      onFocus={(e) => { e.currentTarget.style.borderColor = 'rgba(59,130,246,0.5)'; }}
      onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--border-color)'; }}
    />
  );
}

interface EntryDrawerProps {
  mode: 'create' | 'edit' | null;
  trade: Trade | null;
  schema: NotionSchema;
  saving: boolean;
  filePropNames: string[];
  onSave: (input: TradeInput) => void;
  onDelete: (id: string) => void;
  onImageUpload: (tradeId: string, prop: string, file: File) => Promise<void>;
  onClose: () => void;
}


function ImageUploadSection({
  trade,
  filePropNames,
  onImageUpload,
}: {
  trade: Trade;
  filePropNames: string[];
  onImageUpload: (tradeId: string, prop: string, file: File) => Promise<void>;
}) {
  const [uploading, setUploading] = useState<Record<string, boolean>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  async function handleFile(prop: string, file: File) {
    setUploading((u) => ({ ...u, [prop]: true }));
    setErrors((e) => ({ ...e, [prop]: '' }));
    try {
      await onImageUpload(trade.id, prop, file);
    } catch (e) {
      setErrors((prev) => ({ ...prev, [prop]: e instanceof Error ? e.message : 'Upload failed' }));
    } finally {
      setUploading((u) => ({ ...u, [prop]: false }));
    }
  }

  const sections = filePropNames.length > 0 ? filePropNames : [...new Set(trade.images.map((i) => i.label).filter((l) => l !== 'cover'))];

  return (
    <div>
      <SectionTitle>Screenshots</SectionTitle>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {sections.map((prop) => {
          const imgs = trade.images.filter((i) => i.label === prop);
          const isUploading = uploading[prop];
          const err = errors[prop];
          return (
            <div
              key={prop}
              style={{
                borderRadius: 12,
                border: '1px solid var(--border-color)',
                overflow: 'hidden',
              }}
            >
              {/* Section header */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '8px 12px',
                  background: 'var(--bg-surface)',
                  borderBottom: imgs.length > 0 ? '1px solid var(--border-color)' : 'none',
                }}
              >
                <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-primary)', letterSpacing: '0.02em' }}>
                  {prop}
                </span>
                <button
                  type="button"
                  onClick={() => inputRefs.current[prop]?.click()}
                  disabled={isUploading}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 5,
                    padding: '4px 10px',
                    borderRadius: 7,
                    fontSize: 11,
                    fontWeight: 600,
                    background: isUploading ? 'var(--bg-elevated)' : 'color-mix(in srgb, var(--blue) 12%, transparent)',
                    color: isUploading ? 'var(--text-muted)' : 'var(--blue)',
                    border: '1px solid color-mix(in srgb, var(--blue) 24%, transparent)',
                    cursor: isUploading ? 'wait' : 'pointer',
                    transition: 'all 140ms',
                  }}
                >
                  {isUploading
                    ? <Loader2 size={11} style={{ animation: 'spin 1s linear infinite' }} />
                    : <Upload size={11} />}
                  {isUploading ? 'Uploading...' : 'Add image'}
                </button>
                <input
                  ref={(el) => { inputRefs.current[prop] = el; }}
                  type="file"
                  accept="image/*"
                  style={{ display: 'none' }}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) { handleFile(prop, file); e.target.value = ''; }
                  }}
                />
              </div>
              {/* Error */}
              {err && (
                <div style={{ padding: '6px 12px', fontSize: 11, color: 'var(--red)', background: 'rgba(244,63,94,0.06)' }}>
                  {err}
                </div>
              )}
              {/* Image grid */}
              {imgs.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, padding: '10px 12px', background: 'var(--bg-card)' }}>
                  {imgs.map((img, idx) => (
                    <div
                      key={idx}
                      style={{ width: 80, height: 60, borderRadius: 7, overflow: 'hidden', border: '1px solid var(--border-color)', flexShrink: 0 }}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={img.url} alt={`${prop} ${idx + 1}`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function EntryDrawer({ mode, trade, schema, saving, filePropNames, onSave, onDelete, onImageUpload, onClose }: EntryDrawerProps) {
  const [form, setForm] = useState<TradeInput>(EMPTY_FORM);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [linksOpen, setLinksOpen] = useState(false);

  useEffect(() => {
    if (mode === 'edit' && trade) {
      setForm(tradeToInput(trade));
      setLinksOpen(!!(trade.tradeIdeaLink || trade.oneMTradeLink));
    } else if (mode === 'create') {
      setForm({ ...EMPTY_FORM, date: new Date().toISOString().slice(0, 10) });
      setLinksOpen(false);
    }
    setConfirmDelete(false);
  }, [mode, trade]);

  useEffect(() => {
    if (form.date) {
      const dayName = DAY_FROM_DATE(form.date);
      setForm((f) => ({ ...f, day: [dayName] }));
    }
  }, [form.date]);

  function setField<K extends keyof TradeInput>(key: K, value: TradeInput[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  const isTrade = form.tookTrade.includes('TOOK TRADE');
  const isOpen = mode !== null;
  const title = mode === 'create' ? 'New Entry' : form.date ?? 'Edit Entry';

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        right: 0,
        height: '100%',
        width: 520,
        zIndex: 50,
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--bg-primary)',
        borderLeft: '1px solid var(--border-color)',
        boxShadow: '-20px 0 60px rgba(0,0,0,0.5)',
        transform: isOpen ? 'translateX(0)' : 'translateX(100%)',
        transition: 'transform 320ms cubic-bezier(0.32, 0.72, 0, 1)',
        willChange: 'transform',
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '16px 20px',
          borderBottom: '1px solid var(--border-color)',
          flexShrink: 0,
          background: 'linear-gradient(180deg, var(--bg-card) 0%, var(--bg-primary) 100%)',
        }}
      >
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>
            {mode === 'create' ? 'New Entry' : 'Edit Entry'}
          </div>
          {mode === 'edit' && form.date && (
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>
              {form.date} · {form.day[0] ?? ''}
            </div>
          )}
        </div>
        <button
          onClick={onClose}
          style={{
            width: 30,
            height: 30,
            borderRadius: 8,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'var(--bg-surface)',
            border: '1px solid var(--border-color)',
            color: 'var(--text-secondary)',
            cursor: 'pointer',
            transition: 'all 140ms',
          }}
        >
          <X size={13} strokeWidth={2} />
        </button>
      </div>

      {/* Scrollable body */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '20px', display: 'flex', flexDirection: 'column', gap: 22 }}>

        {/* ── Date & Time ── */}
        <div>
          <SectionTitle>Date &amp; Time</SectionTitle>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <FieldLabel>Date</FieldLabel>
              <TextInput type="date" value={form.date ?? ''} onChange={(v) => setField('date', v)} />
            </div>
            <div>
              <FieldLabel>Time</FieldLabel>
              <TextInput value={form.time} onChange={(v) => setField('time', v)} placeholder="09:30" />
            </div>
          </div>
          {form.day[0] && (
            <div style={{ marginTop: 8 }}>
              <span
                style={{
                  display: 'inline-flex',
                  padding: '3px 10px',
                  borderRadius: 999,
                  fontSize: 10,
                  fontWeight: 600,
                  letterSpacing: '0.06em',
                  textTransform: 'uppercase',
                  background: 'color-mix(in srgb, var(--blue) 10%, transparent)',
                  color: 'var(--blue)',
                  border: '1px solid color-mix(in srgb, var(--blue) 22%, transparent)',
                }}
              >
                {form.day[0]}
              </span>
            </div>
          )}
        </div>

        {/* ── Trade Decision ── */}
        <div>
          <SectionTitle>Did you trade?</SectionTitle>
          <BigToggle
            options={[
              { value: 'TOOK TRADE', label: 'Took Trade', color: 'var(--green)' },
              { value: 'NO TRADE', label: 'No Trade', color: 'var(--blue)' },
            ]}
            selected={form.tookTrade}
            onChange={(v) => setField('tookTrade', v)}
          />
        </div>

        {/* ── Trade-specific fields ── */}
        {isTrade && (
          <>
            {/* Index + Direction */}
            <div>
              <SectionTitle>Setup</SectionTitle>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div>
                  <FieldLabel>Index</FieldLabel>
                  <ChipGroup
                    options={getOpts(schema, 'indices')}
                    selected={form.indices}
                    onChange={(v) => setField('indices', v)}
                    color="var(--blue)"
                  />
                </div>
                <div>
                  <FieldLabel>Direction</FieldLabel>
                  <BigToggle
                    options={[
                      { value: 'long', label: 'Long', color: 'var(--green)' },
                      { value: 'short', label: 'Short', color: 'var(--red)' },
                    ]}
                    selected={form.longShort}
                    onChange={(v) => setField('longShort', v)}
                  />
                </div>
                <div>
                  <FieldLabel>Bias for the Day</FieldLabel>
                  <ChipGroup
                    options={getOpts(schema, 'BIAS FOR THE DAY')}
                    selected={form.biasForTheDay}
                    onChange={(v) => setField('biasForTheDay', v)}
                    color="var(--yellow)"
                    single
                  />
                </div>
                <div>
                  <FieldLabel>Trend</FieldLabel>
                  <ChipGroup
                    options={getOpts(schema, 'TREND')}
                    selected={form.trend}
                    onChange={(v) => setField('trend', v)}
                    color="var(--teal)"
                    single
                  />
                </div>
                <div>
                  <FieldLabel>POI</FieldLabel>
                  <ChipGroup
                    options={getOpts(schema, 'POI')}
                    selected={form.poi}
                    onChange={(v) => setField('poi', v)}
                    color="var(--purple)"
                  />
                </div>
                <div>
                  <FieldLabel>Draw in Liquidity</FieldLabel>
                  <ChipGroup
                    options={getOpts(schema, 'draw in liquidity')}
                    selected={form.drawInLiquidity}
                    onChange={(v) => setField('drawInLiquidity', v)}
                    color="var(--blue)"
                  />
                </div>
                <div>
                  <FieldLabel>Reversal / Continuation</FieldLabel>
                  <ChipGroup
                    options={getOpts(schema, 'reversal/continuation ')}
                    selected={form.reversalContinuation}
                    onChange={(v) => setField('reversalContinuation', v)}
                    color="var(--teal)"
                    single
                  />
                </div>
                <div>
                  <FieldLabel>LTF Entry</FieldLabel>
                  <ChipGroup
                    options={getOpts(schema, 'LOWER TIME ENTRY')}
                    selected={form.lowerTimeEntry}
                    onChange={(v) => setField('lowerTimeEntry', v)}
                    color="var(--purple)"
                  />
                </div>
                <div>
                  <FieldLabel>News</FieldLabel>
                  <ChipGroup
                    options={getOpts(schema, 'NEWS')}
                    selected={form.news}
                    onChange={(v) => setField('news', v)}
                    color="var(--yellow)"
                  />
                </div>
              </div>
            </div>

            {/* Result */}
            <div>
              <SectionTitle>Result</SectionTitle>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div>
                  <FieldLabel>Outcome</FieldLabel>
                  <BigToggle
                    options={[
                      { value: 'win', label: 'Win', color: 'var(--green)' },
                      { value: 'lose', label: 'Loss', color: 'var(--red)' },
                      { value: 'BRAKEVEN', label: 'BE', color: 'var(--yellow)' },
                    ]}
                    selected={form.winLose}
                    onChange={(v) => setField('winLose', v)}
                  />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <div>
                    <FieldLabel>PNL ($)</FieldLabel>
                    <div style={{ position: 'relative' }}>
                      <span
                        style={{
                          position: 'absolute',
                          left: 12,
                          top: '50%',
                          transform: 'translateY(-50%)',
                          color: 'var(--text-muted)',
                          fontSize: 13,
                          pointerEvents: 'none',
                        }}
                      >
                        $
                      </span>
                      <input
                        type="number"
                        value={form.pnl ?? ''}
                        onChange={(e) => setField('pnl', e.target.value === '' ? null : Number(e.target.value))}
                        placeholder="0"
                        style={{
                          width: '100%',
                          padding: '9px 12px 9px 22px',
                          borderRadius: 10,
                          fontSize: 13,
                          fontFamily: 'inherit',
                          background: 'var(--bg-surface)',
                          border: '1px solid var(--border-color)',
                          color: 'var(--text-primary)',
                          outline: 'none',
                          boxSizing: 'border-box',
                          transition: 'border-color 150ms',
                        }}
                        onFocus={(e) => { e.currentTarget.style.borderColor = 'rgba(59,130,246,0.5)'; }}
                        onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--border-color)'; }}
                      />
                    </div>
                  </div>
                  <div>
                    <FieldLabel>Rating</FieldLabel>
                    <ChipGroup
                      options={getOpts(schema, 'RATE TRADE')}
                      selected={form.rateTrade}
                      onChange={(v) => setField('rateTrade', v)}
                      color="var(--green)"
                      single
                    />
                  </div>
                </div>
              </div>
            </div>
          </>
        )}

        {/* ── Psychology ── */}
        <div>
          <SectionTitle>Psychology</SectionTitle>
          <FieldLabel>Rules / Feelings</FieldLabel>
          <ChipGroup
            options={getOpts(schema, 'RULES/feeling')}
            selected={form.rulesFeelings}
            onChange={(v) => setField('rulesFeelings', v)}
            color="var(--teal)"
          />
        </div>

        {/* ── Notes ── */}
        <div>
          <SectionTitle>Notes</SectionTitle>
          <textarea
            value={form.notes}
            onChange={(e) => setField('notes', e.target.value)}
            placeholder="What happened today? Thoughts on the setup, execution, emotions..."
            rows={5}
            style={{
              width: '100%',
              padding: '11px 13px',
              borderRadius: 10,
              fontSize: 13,
              lineHeight: 1.7,
              fontFamily: 'inherit',
              background: 'var(--bg-surface)',
              border: '1px solid var(--border-color)',
              color: 'var(--text-primary)',
              outline: 'none',
              resize: 'vertical',
              boxSizing: 'border-box',
              transition: 'border-color 150ms',
            }}
            onFocus={(e) => { e.currentTarget.style.borderColor = 'rgba(59,130,246,0.5)'; }}
            onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--border-color)'; }}
          />
        </div>

        {/* ── Screenshots ── */}
        {mode === 'edit' && trade && (filePropNames.length > 0 || trade.images.length > 0) && (
          <ImageUploadSection
            trade={trade}
            filePropNames={filePropNames}
            onImageUpload={onImageUpload}
          />
        )}

        {/* ── Links (collapsible) ── */}
        <div>
          <button
            type="button"
            onClick={() => setLinksOpen((o) => !o)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              width: '100%',
              background: 'none',
              border: 'none',
              padding: 0,
              cursor: 'pointer',
              marginBottom: linksOpen ? 14 : 0,
            }}
          >
            <div
              style={{
                flex: 1,
                height: 1,
                background: 'var(--border-color)',
              }}
            />
            <span
              style={{
                fontSize: 9,
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.14em',
                color: 'var(--text-muted)',
                flexShrink: 0,
              }}
            >
              Links {linksOpen ? '▲' : '▼'}
            </span>
            <div style={{ flex: 1, height: 1, background: 'var(--border-color)' }} />
          </button>
          {linksOpen && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div>
                <FieldLabel>Trade Idea Link</FieldLabel>
                <TextInput
                  value={form.tradeIdeaLink ?? ''}
                  onChange={(v) => setField('tradeIdeaLink', v || null)}
                  placeholder="https://..."
                />
              </div>
              <div>
                <FieldLabel>1M Chart Link</FieldLabel>
                <TextInput
                  value={form.oneMTradeLink ?? ''}
                  onChange={(v) => setField('oneMTradeLink', v || null)}
                  placeholder="https://..."
                />
              </div>
            </div>
          )}
        </div>

        {/* Bottom padding for footer */}
        <div style={{ height: 80 }} />
      </div>

      {/* Footer */}
      <div
        style={{
          flexShrink: 0,
          padding: '14px 20px',
          borderTop: '1px solid var(--border-color)',
          background: 'linear-gradient(0deg, var(--bg-card) 0%, var(--bg-primary) 100%)',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}
      >
        {/* Save */}
        <button
          type="button"
          onClick={() => onSave(form)}
          disabled={saving}
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            padding: '10px 16px',
            borderRadius: 10,
            fontSize: 13,
            fontWeight: 600,
            letterSpacing: '-0.01em',
            background: saving ? 'rgba(59,130,246,0.45)' : 'var(--blue)',
            color: 'white',
            border: 'none',
            cursor: saving ? 'wait' : 'pointer',
            boxShadow: saving ? 'none' : '0 1px 0 rgba(255,255,255,0.08) inset, 0 3px 12px rgba(59,130,246,0.2)',
            transition: 'all 150ms',
          }}
          onMouseDown={(e) => { if (!saving) e.currentTarget.style.transform = 'scale(0.97) translateY(1px)'; }}
          onMouseUp={(e) => { e.currentTarget.style.transform = ''; }}
          onMouseLeave={(e) => { e.currentTarget.style.transform = ''; }}
        >
          <Save size={13} strokeWidth={2.2} />
          {saving ? 'Saving...' : mode === 'create' ? 'Create Entry' : 'Save Changes'}
        </button>

        {/* Delete (edit mode only) */}
        {mode === 'edit' && trade && (
          confirmDelete ? (
            <div style={{ display: 'flex', gap: 6 }}>
              <button
                type="button"
                onClick={() => { setConfirmDelete(false); onDelete(trade.id); }}
                style={{
                  padding: '10px 14px',
                  borderRadius: 10,
                  fontSize: 12,
                  fontWeight: 600,
                  background: 'rgba(244,63,94,0.12)',
                  color: 'var(--red)',
                  border: '1px solid rgba(244,63,94,0.25)',
                  cursor: 'pointer',
                  transition: 'all 140ms',
                }}
              >
                Confirm
              </button>
              <button
                type="button"
                onClick={() => setConfirmDelete(false)}
                style={{
                  padding: '10px 14px',
                  borderRadius: 10,
                  fontSize: 12,
                  fontWeight: 600,
                  background: 'var(--bg-surface)',
                  color: 'var(--text-secondary)',
                  border: '1px solid var(--border-color)',
                  cursor: 'pointer',
                  transition: 'all 140ms',
                }}
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              style={{
                width: 38,
                height: 38,
                borderRadius: 10,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'var(--bg-surface)',
                border: '1px solid var(--border-color)',
                color: 'var(--text-muted)',
                cursor: 'pointer',
                transition: 'all 140ms',
                flexShrink: 0,
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(244,63,94,0.08)';
                e.currentTarget.style.borderColor = 'rgba(244,63,94,0.25)';
                e.currentTarget.style.color = 'var(--red)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'var(--bg-surface)';
                e.currentTarget.style.borderColor = 'var(--border-color)';
                e.currentTarget.style.color = 'var(--text-muted)';
              }}
            >
              <Trash2 size={13} strokeWidth={2} />
            </button>
          )
        )}
      </div>
    </div>
  );
}
