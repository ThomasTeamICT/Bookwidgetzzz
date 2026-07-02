import React, { useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { deleteFolder, deleteWidget, getFolders, getSubmissions, getWidgets, onStorageChange, saveFolder, saveWidget } from '../lib/storage';
import { importWidgetJson } from '../lib/share';
import { formatDateShort, makeCode, uid } from '../lib/utils';
import { getTypeDef } from '../widgets/registry';
import { ConfirmModal, EmptyState, Field, Modal, useToast } from '../components/ui';
import type { Folder, Widget } from '../lib/types';
import { ShareModal } from '../components/ShareModal';

const FOLDER_COLORS = ['#4f46e5', '#0ea5e9', '#16a34a', '#d97706', '#dc2626', '#9333ea'];

export function TeacherDashboard() {
  const [, force] = useState(0);
  React.useEffect(() => onStorageChange(() => force((x) => x + 1)), []);

  const widgets = getWidgets();
  const folders = getFolders();
  const [search, setSearch] = useState('');
  const [activeFolder, setActiveFolder] = useState<string | null | 'all'>('all');
  const [folderModal, setFolderModal] = useState<Folder | 'new' | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Widget | null>(null);
  const [deleteFolderTarget, setDeleteFolderTarget] = useState<Folder | null>(null);
  const [shareTarget, setShareTarget] = useState<Widget | null>(null);
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const toast = useToast();
  const navigate = useNavigate();

  const visible = useMemo(() => {
    let list = widgets;
    if (activeFolder !== 'all') list = list.filter((w) => w.folderId === activeFolder);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((w) => w.title.toLowerCase().includes(q) || getTypeDef(w.type).name.toLowerCase().includes(q) || w.code.toLowerCase() === q);
    }
    return list;
  }, [widgets, activeFolder, search]);

  const duplicate = (w: Widget) => {
    const copy: Widget = {
      ...JSON.parse(JSON.stringify(w)),
      id: uid(),
      code: makeCode(),
      title: `${w.title} (kopie)`,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    saveWidget(copy);
    toast('Widget gedupliceerd', 'ok');
  };

  const importFile = async (file: File) => {
    const text = await file.text();
    const w = importWidgetJson(text);
    if (!w) {
      toast('Dit bestand is geen geldige widget', 'err');
      return;
    }
    w.id = uid();
    w.code = makeCode();
    w.folderId = null;
    saveWidget(w as Widget);
    toast(`“${w.title}” geïmporteerd`, 'ok');
  };

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Mijn widgets</h1>
          <p className="sub">{widgets.length} widget{widgets.length === 1 ? '' : 's'} · alles lokaal opgeslagen in deze browser</p>
        </div>
        <div className="page-head-actions">
          <button className="btn btn-ghost" onClick={() => fileRef.current?.click()}>📥 Importeren</button>
          <input ref={fileRef} type="file" accept="application/json,.json" hidden
            onChange={(e) => { const f = e.target.files?.[0]; if (f) importFile(f); e.target.value = ''; }} />
          <Link to="/nieuw" className="btn btn-primary">+ Nieuwe widget</Link>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 20 }}>
        <input
          className="input" type="search" placeholder="🔍 Zoeken op titel, type of code…"
          style={{ maxWidth: 320 }}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Widgets zoeken"
        />
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }} role="tablist" aria-label="Mappen">
          <button className={`btn btn-sm ${activeFolder === 'all' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setActiveFolder('all')} role="tab" aria-selected={activeFolder === 'all'}>
            Alles
          </button>
          <button className={`btn btn-sm ${activeFolder === null ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setActiveFolder(null)} role="tab" aria-selected={activeFolder === null}>
            📂 Zonder map
          </button>
          {folders.map((f) => (
            <button
              key={f.id}
              className={`btn btn-sm ${activeFolder === f.id ? 'btn-primary' : 'btn-ghost'}`}
              style={activeFolder === f.id ? { background: f.color } : { color: f.color, borderColor: f.color }}
              onClick={() => setActiveFolder(f.id)}
              onDoubleClick={() => setFolderModal(f)}
              role="tab" aria-selected={activeFolder === f.id}
              title="Dubbelklik om te bewerken"
            >
              📁 {f.name}
            </button>
          ))}
          <button className="btn btn-sm btn-quiet" onClick={() => setFolderModal('new')}>+ Map</button>
          {activeFolder !== 'all' && activeFolder !== null && (
            <button className="btn btn-sm btn-quiet" style={{ color: 'var(--err)' }}
              onClick={() => setDeleteFolderTarget(folders.find((f) => f.id === activeFolder) ?? null)}>
              Map verwijderen
            </button>
          )}
        </div>
      </div>

      {visible.length === 0 ? (
        <EmptyState icon="🧩" title={search ? 'Geen widgets gevonden' : 'Nog geen widgets hier'}>
          <p>{search ? 'Probeer een andere zoekterm.' : 'Maak je eerste widget en deel hem met je klas.'}</p>
          {!search && <Link to="/nieuw" className="btn btn-primary">+ Nieuwe widget</Link>}
        </EmptyState>
      ) : (
        <div className="widget-grid">
          {visible.map((w) => {
            const def = getTypeDef(w.type);
            const subs = getSubmissions(w.id);
            return (
              <div key={w.id} className="card widget-card" onClick={() => navigate(`/bewerk/${w.id}`)} role="button" tabIndex={0}
                onKeyDown={(e) => { if (e.key === 'Enter') navigate(`/bewerk/${w.id}`); }}
                aria-label={`${w.title} (${def.name}) bewerken`}>
                <div className="widget-card-banner" style={{ background: `linear-gradient(120deg, ${def.color}, ${def.color}bb)` }}>
                  <span className="icon" aria-hidden>{def.icon}</span>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 800, fontSize: '0.82rem', opacity: 0.9, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{def.name}</div>
                    <div style={{ fontFamily: 'monospace', fontSize: '0.95rem', fontWeight: 700, letterSpacing: '0.12em' }}>{w.code}</div>
                  </div>
                  <div style={{ marginLeft: 'auto', position: 'relative' }} onClick={(e) => e.stopPropagation()}>
                    <button
                      className="btn btn-icon btn-sm"
                      style={{ background: 'rgba(255,255,255,0.22)', color: '#fff' }}
                      aria-label={`Acties voor ${w.title}`}
                      aria-expanded={menuFor === w.id}
                      onClick={() => setMenuFor(menuFor === w.id ? null : w.id)}
                    >⋯</button>
                    {menuFor === w.id && (
                      <div className="card" role="menu" style={{ position: 'absolute', right: 0, top: '110%', zIndex: 40, width: 190, padding: 6, display: 'grid', boxShadow: 'var(--shadow-2)' }}>
                        <button className="btn btn-quiet btn-sm" style={{ justifyContent: 'flex-start' }} role="menuitem" onClick={() => { setMenuFor(null); setShareTarget(w); }}>📤 Delen</button>
                        <button className="btn btn-quiet btn-sm" style={{ justifyContent: 'flex-start' }} role="menuitem" onClick={() => { setMenuFor(null); navigate(`/resultaten/${w.id}`); }}>📊 Resultaten ({subs.length})</button>
                        <button className="btn btn-quiet btn-sm" style={{ justifyContent: 'flex-start' }} role="menuitem" onClick={() => { setMenuFor(null); duplicate(w); }}>⧉ Dupliceren</button>
                        {folders.length > 0 && (
                          <select
                            className="select input-sm" aria-label="Verplaats naar map"
                            value={w.folderId ?? ''}
                            onChange={(e) => { saveWidget({ ...w, folderId: e.target.value || null }); setMenuFor(null); }}
                            style={{ margin: '4px 6px' }}
                          >
                            <option value="">Zonder map</option>
                            {folders.map((f) => <option key={f.id} value={f.id}>📁 {f.name}</option>)}
                          </select>
                        )}
                        <button className="btn btn-quiet btn-sm" style={{ justifyContent: 'flex-start', color: 'var(--err)' }} role="menuitem" onClick={() => { setMenuFor(null); setDeleteTarget(w); }}>🗑 Verwijderen</button>
                      </div>
                    )}
                  </div>
                </div>
                <div className="widget-card-body">
                  <span className="widget-card-title">{w.title}</span>
                  <div className="widget-card-meta">
                    {subs.length > 0 && <span className="badge badge-ok">📊 {subs.length} inzending{subs.length === 1 ? '' : 'en'}</span>}
                    <span className="date">{formatDateShort(w.updatedAt)}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {folderModal && (
        <FolderModal
          folder={folderModal === 'new' ? null : folderModal}
          onClose={() => setFolderModal(null)}
        />
      )}
      {deleteTarget && (
        <ConfirmModal
          title="Widget verwijderen?"
          message={`“${deleteTarget.title}” en alle bijbehorende resultaten worden definitief verwijderd.`}
          onConfirm={() => { deleteWidget(deleteTarget.id); toast('Widget verwijderd', 'ok'); }}
          onClose={() => setDeleteTarget(null)}
        />
      )}
      {deleteFolderTarget && (
        <ConfirmModal
          title="Map verwijderen?"
          message={`De map “${deleteFolderTarget.name}” wordt verwijderd. De widgets erin blijven bestaan en verhuizen naar “Zonder map”.`}
          onConfirm={() => { deleteFolder(deleteFolderTarget.id); setActiveFolder('all'); toast('Map verwijderd', 'ok'); }}
          onClose={() => setDeleteFolderTarget(null)}
        />
      )}
      {shareTarget && <ShareModal widget={shareTarget} onClose={() => setShareTarget(null)} />}
    </div>
  );
}

function FolderModal({ folder, onClose }: { folder: Folder | null; onClose: () => void }) {
  const [name, setName] = useState(folder?.name ?? '');
  const [color, setColor] = useState(folder?.color ?? FOLDER_COLORS[0]);
  const toast = useToast();
  return (
    <Modal
      title={folder ? 'Map bewerken' : 'Nieuwe map'}
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>Annuleren</button>
          <button
            className="btn btn-primary"
            disabled={!name.trim()}
            onClick={() => {
              saveFolder({ id: folder?.id ?? uid(), name: name.trim(), color, createdAt: folder?.createdAt ?? Date.now() });
              toast(folder ? 'Map bijgewerkt' : 'Map aangemaakt', 'ok');
              onClose();
            }}
          >
            Opslaan
          </button>
        </>
      }
    >
      <Field label="Naam van de map">
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="bv. 3de graad — Frans" />
      </Field>
      <Field label="Kleur">
        <div style={{ display: 'flex', gap: 8 }}>
          {FOLDER_COLORS.map((c) => (
            <button key={c} className="wb-swatch" style={{ background: c, borderColor: color === c ? 'var(--text)' : 'transparent' }}
              aria-label={`Kleur ${c}`} aria-pressed={color === c} onClick={() => setColor(c)} />
          ))}
        </div>
      </Field>
    </Modal>
  );
}
