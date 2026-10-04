import { useEffect, useMemo } from 'react';
import { ArrowLeft, ArrowRight, BadgeCheck, CheckCircle2, ClipboardCheck, ExternalLink, FileSearch, X } from 'lucide-react';
import { api } from '@/api';
import { useApi } from '@/api/hooks';
import { fmtDate } from '@/domain/format';
import { FIELD_LABEL } from '@/domain/slip';
import { ROLE_LABEL } from '@/domain/forms';
import { useUi, type SourceTarget } from './store';
import { originalPdfUrl } from '@/domain/originals';
import { Button, Skeleton, VerifyChip, docShort } from './primitives';
import { SlipView, highlightOf } from './SlipView';

/** S08 · Citation viewer. Source document with the extracted region highlighted, plus how it was read and who confirmed it. */
export function SourcePanel() {
  const source = useUi(s => s.source);
  const close = useUi(s => s.closeSource);
  useEffect(() => {
    if (!source) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); close(); } };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [source, close]);
  if (!source) return null;
  return (
    <>
      <div className="panel-scrim" style={{ zIndex: 59 }} onClick={close} />
      {source.kind === 'absence' ? <AbsencePanel key={source.title} source={source} /> : <CitationBody key={source.citation.id} source={source} />}
    </>
  );
}

type CitationSource = Extract<SourceTarget, { kind: 'citation' }>;
type AbsenceSource = Extract<SourceTarget, { kind: 'absence' }>;

function CitationBody({ source }: { source: CitationSource }) {
  const { citation, patientId } = source;
  const role = useUi(s => s.role);
  const close = useUi(s => s.closeSource);
  const openSource = useUi(s => s.openSource);
  const toast = useUi(s => s.toast);
  const isClosure = !!citation.closureRef;
  const { data, loading } = useApi(() => api.getDocumentView(patientId, citation.docId), [patientId, citation.docId]);
  const fact = useMemo(() => data?.recall.facts.find(f => f.citation.id === citation.id), [data, citation.id]);
  const doc = data?.doc ?? null;
  const siblings = data?.siblings ?? [];
  const idx = doc ? siblings.findIndex(d => d.id === doc.id) : -1;
  const step = (d: -1 | 1) => {
    const t = siblings[idx + d]; if (!t) return;
    openSource({ kind: 'citation', patientId, citation: { id: `nav:${t.id}`, docId: t.id, field: citation.field, adviceIndex: citation.adviceIndex, quote: '' }, title: undefined });
  };

  const verify = async () => {
    if (!fact) return;
    const r = await api.verifyFacts(patientId, [fact.id], role);
    toast(r.ok ? `Confirmed ${fact.display}` : r.error, r.ok ? 'ok' : 'error');
  };

  const task = isClosure ? data?.recall.tasks.find(t => t.id === citation.closureRef!.taskId) : undefined;
  const alsoDoc = citation.alsoIn?.[0];
  const navCite = citation.id.startsWith('nav:');

  return (
    <aside className="panel panel--cite" role="dialog" aria-label="Source document" aria-modal="false">
      <div className="panel__head">
        <div className="grow">
          <div className="eyebrow">Source</div>
          <h2 style={{ fontSize: 20, marginTop: 2 }}>{source.title ?? (isClosure ? citation.quote : navCite ? doc ? `${doc.title} · visit ${doc.visit}` : 'Source' : citation.quote.length < 46 ? citation.quote : FIELD_LABEL[citation.field])}</h2>
          <div className="muted" style={{ fontSize: 13, marginTop: 2 }}>
            {isClosure ? `Staff-entered evidence · ${citation.closureRef!.taskId}` : doc ? `${doc.title} · visit ${doc.visit} · ${fmtDate(doc.date)} · page 1 of 1` : docShort(citation.docId)}
          </div>
        </div>
        <Button variant="ghost" size="icon" onClick={close} aria-label="Close source (Esc)"><X size={18} /></Button>
      </div>
      <div className="panel__body">
        {loading && <><Skeleton h={300} /><Skeleton h={14} w="60%" style={{ marginTop: 16 }} /></>}

        {isClosure && task && (
          <div className="stack">
            <div className="card card--tint" style={{ padding: 16 }}>
              <div className="row" style={{ gap: 8 }}><ClipboardCheck size={18} /><b>Closure evidence — {task.title}</b></div>
              <dl className="kv" style={{ marginTop: 12 }}>
                <dt>Evidence</dt><dd>{task.evidence?.summary}</dd>
                <dt>Action taken</dt><dd>{task.action?.type}{task.action?.note ? ` — ${task.action.note}` : ''}</dd>
                <dt>Entered by</dt><dd>{task.evidence?.by} · {task.evidence && `${fmtDate(task.evidence.at)}, ${task.evidence.at.slice(11, 16)}`}</dd>
                <dt>Status</dt><dd>{task.status === 'closed' ? <><VerifyChip state="verified" by={task.closure?.by} /> closed by {task.closure?.by}</> : <VerifyChip state="imported" />}</dd>
              </dl>
            </div>
            <p className="hint">Staff-entered values are labelled as such everywhere. They become verified when a clinician closes the task.</p>
          </div>
        )}

        {doc && (
          <>
            <SlipView doc={doc} highlights={navCite ? [] : [highlightOf(citation, 'active')]} scrollToActive />
            {doc.copyOf && <p className="hint" style={{ marginTop: 10 }}>The workbook notes this diagnostic report carries the same text as the prescription (visit {doc.visit}), so each value is corroborated by both.</p>}

            <div className="row" style={{ justifyContent: 'space-between', marginTop: 14 }}>
              <Button variant="secondary" size="sm" disabled={idx <= 0} onClick={() => step(-1)} icon={<ArrowLeft size={14} />}>Visit {idx > 0 ? siblings[idx - 1].visit : '—'}</Button>
              <span className="muted" style={{ fontSize: 12 }}>{doc.sheet} · row {doc.sheetRow}</span>
              <Button variant="secondary" size="sm" disabled={idx < 0 || idx >= siblings.length - 1} onClick={() => step(1)}>Visit {idx >= 0 && idx < siblings.length - 1 ? siblings[idx + 1].visit : '—'} <ArrowRight size={14} /></Button>
            </div>

            {!navCite && (
              <>
                <hr className="hr" />
                <div className="eyebrow" style={{ marginBottom: 10 }}>How this was read</div>
                <dl className="kv">
                  <dt>Region</dt><dd>{FIELD_LABEL[citation.field]}{citation.adviceIndex !== undefined ? ` · item ${citation.adviceIndex + 1}` : ''}{citation.span ? ` · characters ${citation.span[0] + 1}–${citation.span[1]}` : ''}</dd>
                  <dt>Quoted text</dt><dd><q style={{ background: 'var(--cerulean-tint)', padding: '1px 5px', borderRadius: 3 }}>{citation.quote}</q></dd>
                  {fact && <><dt>Extracted as</dt><dd><b>{fact.display}</b>{fact.unit === 'mg/dL' ? <span className="muted"> — printed “mg/dl”, canonical mg/dL</span> : null}</dd></>}
                  <dt>Method</dt><dd>Pattern parser on HIS text{fact ? ` · ${fact.extractor.name} ${fact.extractor.version} · ${fact.extractor.rule}` : ''}</dd>
                  <dt>Basis</dt><dd>Exact text match. No OCR confidence applies — the HIS supplied this as text.</dd>
                  {fact && <><dt>Verification</dt><dd className="row-wrap"><VerifyChip state={fact.verification} by={fact.verifiedBy} />{fact.verifiedBy && <span className="muted" style={{ fontSize: 12 }}>{fact.verifiedBy} · {fmtDate(fact.verifiedAt)}</span>}</dd></>}
                  {alsoDoc && <><dt>Also in</dt><dd><button className="cite" onClick={() => openSource({ kind: 'citation', patientId, citation: { ...citation, id: `nav:${alsoDoc}`, docId: alsoDoc, alsoIn: [citation.docId] } })}>{docShort(alsoDoc)}</button> — identical text</dd></>}
                </dl>
                <p className="hint" style={{ marginTop: 12 }}>Corrections never overwrite the original. A corrected value would be saved as a new version with an audit entry.</p>
              </>
            )}
          </>
        )}
      </div>
      <div className="panel__foot">
        {role === 'coordinator' && fact && fact.verification !== 'verified' && <span className="hint grow">Coordinators can’t verify values — a doctor or nurse can.</span>}
        {doc && <a className="btn btn--secondary btn--sm" href={originalPdfUrl(patientId, doc.visit)} target="_blank" rel="noopener noreferrer"><ExternalLink size={14} />View original document</a>}
        {fact && <Button size="sm" onClick={verify} disabled={fact.verification === 'verified'} icon={fact.verification === 'verified' ? <CheckCircle2 size={14} /> : <BadgeCheck size={14} />}>{fact.verification === 'verified' ? 'Value confirmed' : 'Confirm value'}</Button>}
      </div>
    </aside>
  );
}

function AbsencePanel({ source }: { source: AbsenceSource }) {
  const close = useUi(s => s.closeSource);
  const openSource = useUi(s => s.openSource);
  const { absence, title, patientId } = source;
  const { data } = useApi(() => api.getRecall(patientId), [patientId]);
  const docs = (data?.documents ?? []).filter(d => absence.searchedDocIds.includes(d.id));
  return (
    <aside className="panel panel--cite" role="dialog" aria-label="Absence evidence">
      <div className="panel__head">
        <div className="grow">
          <div className="eyebrow">Absence is a finding</div>
          <h2 style={{ fontSize: 20, marginTop: 2 }}>{title}</h2>
          <div className="muted" style={{ fontSize: 13, marginTop: 2 }}>{absence.scope}</div>
        </div>
        <Button variant="ghost" size="icon" onClick={close} aria-label="Close (Esc)"><X size={18} /></Button>
      </div>
      <div className="panel__body">
        <div className="card card--tint" style={{ padding: 16 }}>
          <div className="row"><FileSearch size={18} /><b>0 matches in {absence.searchedDocIds.length} documents</b></div>
          <p className="muted" style={{ marginTop: 6 }}>Terms searched in complaint, investigation and diagnosis text:</p>
          <div className="row-wrap" style={{ marginTop: 8 }}>{absence.terms.map(t => <span key={t} className="chip chip--outline">{t}</span>)}</div>
        </div>
        <div className="eyebrow" style={{ margin: '18px 0 8px' }}>Documents searched</div>
        <ul className="stack" style={{ gap: 6 }}>
          {docs.map(d => (
            <li key={d.id}>
              <button className="card card--click" style={{ width: '100%', textAlign: 'left', padding: '9px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                onClick={() => openSource({ kind: 'citation', patientId, citation: { id: `nav:${d.id}`, docId: d.id, field: 'investigations', quote: '' } })}>
                <span><b>{d.title}</b> · visit {d.visit} · {fmtDate(d.date)}</span>
                <span className="chip chip--outline">0 matches</span>
              </button>
            </li>
          ))}
        </ul>
        <p className="hint" style={{ marginTop: 14 }}>A missing test is shown as a care gap, never as blank space. This record may be incomplete — the test may exist elsewhere. Capturing it clears the gap.</p>
      </div>
      <div className="panel__foot"><span className="muted grow" style={{ fontSize: 12 }}>Rule evaluation is deterministic — {ROLE_LABEL.doctor} view</span><Button size="sm" variant="secondary" onClick={close}>Close</Button></div>
    </aside>
  );
}
