'use client';

import { ExternalLink, Check } from 'lucide-react';
import type { NotionPropValue } from '@/lib/notion-page';
import { tagBg, tagFg } from '../v2/colors';
import type { NotebookPalette } from './notebookConfig';

interface Props {
  value: NotionPropValue;
  palette: NotebookPalette;
  textScale: number;
  imageScale: number;
  onImageClick?: (idx: number) => void;
}

function formatDate(iso: string): string {
  if (!iso) return '';
  const onlyDate = iso.split('T')[0];
  const [y, m, d] = onlyDate.split('-').map(Number);
  if (!y || !m || !d) return iso;
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${months[m-1]} ${d}, ${y}`;
}

export function NotebookDisplay({ value, palette, textScale, imageScale, onImageClick }: Props) {
  const base = 15 * textScale;
  const small = 13 * textScale;

  switch (value.type) {
    case 'title':
      return value.text
        ? <span style={{ fontSize: base * 1.1, fontWeight: 500, color: palette.textPrimary, whiteSpace: 'pre-wrap', lineHeight: 1.4 }}>{value.text}</span>
        : null;

    case 'rich_text':
      return value.text
        ? <span style={{ fontSize: base, color: palette.textPrimary, whiteSpace: 'pre-wrap', lineHeight: 1.7 }}>{value.text}</span>
        : null;

    case 'number':
      if (value.value === null) return null;
      return <span style={{ fontSize: base, fontWeight: 600, color: palette.textPrimary }} className="tabular">{value.value}</span>;

    case 'select':
      return value.option ? <Tag name={value.option.name} color={value.option.color} scale={textScale} /> : null;

    case 'multi_select':
      if (!value.options.length) return null;
      return (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {value.options.map(o => <Tag key={o.id ?? o.name} name={o.name} color={o.color} scale={textScale} />)}
        </div>
      );

    case 'status':
      return value.option ? <Tag name={value.option.name} color={value.option.color} scale={textScale} /> : null;

    case 'date': {
      if (!value.start) return null;
      const d = formatDate(value.start);
      const e = value.end ? ' → ' + formatDate(value.end) : '';
      return <span style={{ fontSize: base, color: palette.textPrimary }}>{d}{e}</span>;
    }

    case 'url':
      if (!value.value) return null;
      let display = value.value;
      try { display = new URL(value.value).hostname.replace('www.', ''); } catch {}
      return (
        <a href={value.value} target="_blank" rel="noopener noreferrer"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: 'var(--blue)', fontSize: small, textDecoration: 'none' }}>
          <ExternalLink size={13} />
          {display}
        </a>
      );

    case 'email':
      return value.value
        ? <a href={`mailto:${value.value}`} style={{ fontSize: small, color: 'var(--blue)', textDecoration: 'none' }}>{value.value}</a>
        : null;

    case 'phone_number':
      return value.value
        ? <a href={`tel:${value.value}`} style={{ fontSize: small, color: palette.textPrimary }}>{value.value}</a>
        : null;

    case 'checkbox':
      return (
        <span style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          width: 20, height: 20, borderRadius: 4,
          background: value.value ? 'var(--blue)' : 'transparent',
          border: `1.5px solid ${value.value ? 'var(--blue)' : palette.borderHover}`,
        }}>
          {value.value && <Check size={14} color="white" strokeWidth={3} />}
        </span>
      );

    case 'files':
      if (!value.files.length) return null;
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, alignItems: 'flex-start', width: '100%' }}>
          {value.files.map((f, i) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={i} src={f.url} alt=""
              onClick={onImageClick ? () => onImageClick(i) : undefined}
              style={{
                width: `${imageScale * 100}%`,
                maxHeight: '80vh',
                objectFit: 'contain',
                borderRadius: 6,
                border: `1px solid ${palette.border}`,
                cursor: onImageClick ? 'zoom-in' : 'default',
                display: 'block',
              }}
            />
          ))}
        </div>
      );

    case 'people':
      if (!value.people.length) return null;
      return (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {value.people.map(p => (
            <span key={p.id} style={{ fontSize: small, color: palette.textSecondary }}>
              {p.name ?? '—'}
            </span>
          ))}
        </div>
      );

    case 'relation':
      if (!value.ids.length) return null;
      return <span style={{ fontSize: small, color: palette.textMuted }}>{value.ids.length} link{value.ids.length === 1 ? '' : 's'}</span>;

    case 'formula':
    case 'rollup':
      return value.display ? <span style={{ fontSize: base, color: palette.textPrimary }}>{value.display}</span> : null;

    case 'created_time':
    case 'last_edited_time':
      return value.value ? <span style={{ fontSize: small, color: palette.textMuted }}>{formatDate(value.value)}</span> : null;

    case 'created_by':
    case 'last_edited_by':
      return value.user ? <span style={{ fontSize: small, color: palette.textMuted }}>{value.user.name ?? '—'}</span> : null;

    case 'unique_id':
      if (value.number === null) return null;
      return <span style={{ fontSize: small, color: palette.textSecondary, fontFamily: 'monospace' }}>{value.prefix ? `${value.prefix}-` : ''}{value.number}</span>;

    case 'unsupported':
    default:
      return null;
  }
}

function Tag({ name, color, scale }: { name: string; color?: string; scale: number }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center',
      padding: `${3 * scale}px ${10 * scale}px`,
      borderRadius: 5,
      fontSize: 12 * scale,
      fontWeight: 500,
      lineHeight: 1.4,
      background: tagBg(color),
      color: tagFg(color),
      whiteSpace: 'nowrap',
    }}>{name}</span>
  );
}

export function isEmpty(value: NotionPropValue): boolean {
  switch (value.type) {
    case 'title': return !value.text;
    case 'rich_text': return !value.text;
    case 'number': return value.value === null;
    case 'select': return !value.option;
    case 'multi_select': return value.options.length === 0;
    case 'status': return !value.option;
    case 'date': return !value.start;
    case 'url': return !value.value;
    case 'email': return !value.value;
    case 'phone_number': return !value.value;
    case 'checkbox': return false;
    case 'files': return value.files.length === 0;
    case 'people': return value.people.length === 0;
    case 'relation': return value.ids.length === 0;
    case 'formula':
    case 'rollup': return !value.display;
    case 'created_time':
    case 'last_edited_time': return !value.value;
    case 'created_by':
    case 'last_edited_by': return !value.user;
    case 'unique_id': return value.number === null;
    case 'unsupported': return true;
    default: return true;
  }
}
