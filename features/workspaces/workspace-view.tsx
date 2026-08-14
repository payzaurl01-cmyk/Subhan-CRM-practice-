"use client";

import { useMemo, useState } from "react";
import { ChevronDown, Filter, Grid2X2, List, MoreHorizontal, Plus, Search, SlidersHorizontal, X } from "lucide-react";
import type { WorkspaceConfig, WorkspaceRow } from "./workspace-data";

function statusClass(status: string) {
  return status.toLowerCase().replaceAll(" ", "-");
}

export function WorkspaceView({ config }: { config: WorkspaceConfig }) {
  const [query, setQuery] = useState("");
  const [rows, setRows] = useState(config.rows);
  const [modalOpen, setModalOpen] = useState(false);
  const [toast, setToast] = useState("");

  const filteredRows = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return rows;
    return rows.filter((row) => Object.values(row).some((value) => value.toLowerCase().includes(normalized)));
  }, [query, rows]);

  function addRecord(formData: FormData) {
    const first = String(formData.get("primary") || `New ${config.singular}`);
    const second = String(formData.get("secondary") || "Not assigned");
    const row: WorkspaceRow = { id: `new-${Date.now()}`, status: "Draft" };
    config.columns.forEach((column, index) => {
      row[column.key] = index === 0 ? first : index === 1 ? second : index === config.columns.length - 1 ? "Draft" : "—";
    });
    setRows((current) => [row, ...current]);
    setModalOpen(false);
    setToast(`${config.singular[0].toUpperCase()}${config.singular.slice(1)} added to this preview.`);
    window.setTimeout(() => setToast(""), 2800);
  }

  return (
    <div className="workspace-page">
      <div className="page-intro workspace-intro">
        <div><h2>{config.title}</h2><p>{config.description}</p></div>
        <button className="primary-button" onClick={() => setModalOpen(true)}><Plus size={17} /> {config.action}</button>
      </div>

      <section className="workspace-stats">
        {config.stats.map((stat, index) => <article key={stat.label}><span>{stat.label}</span><strong>{stat.value}</strong><small className={index === 2 ? "amber" : "green"}>{stat.change}</small></article>)}
      </section>

      <section className="panel workspace-panel">
        <div className="workspace-toolbar">
          <label className="table-search"><Search size={17}/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={`Search ${config.title.toLowerCase()}…`} />{query && <button onClick={() => setQuery("")} aria-label="Clear search"><X size={14}/></button>}</label>
          <div>
            <button className="toolbar-button"><Filter size={16}/> Filters <ChevronDown size={14}/></button>
            <button className="toolbar-button hide-mobile"><SlidersHorizontal size={16}/> Columns</button>
            <span className="view-switch"><button className="active" aria-label="List view"><List size={16}/></button><button aria-label="Grid view"><Grid2X2 size={16}/></button></span>
          </div>
        </div>

        {filteredRows.length ? (
          <>
            <div className="table-wrap workspace-table-wrap">
              <table className="data-table workspace-table">
                <thead><tr><th className="check-cell"><input type="checkbox" aria-label="Select all"/></th>{config.columns.map((column) => <th key={column.key}>{column.label}</th>)}<th /></tr></thead>
                <tbody>{filteredRows.map((row) => <tr key={row.id}><td className="check-cell"><input type="checkbox" aria-label={`Select ${row[config.columns[0].key]}`}/></td>{config.columns.map((column, index) => <td key={column.key}>{column.key === "status" ? <span className={`status ${statusClass(row[column.key])}`}>{row[column.key]}</span> : index === 0 ? <strong>{row[column.key]}</strong> : row[column.key]}</td>)}<td><button className="row-menu" aria-label="Record actions"><MoreHorizontal size={17}/></button></td></tr>)}</tbody>
              </table>
            </div>
            <div className="record-card-list">{filteredRows.map((row) => <article key={row.id}><div><span className="record-avatar">{row[config.columns[0].key].slice(0, 2).toUpperCase()}</span><p><strong>{row[config.columns[0].key]}</strong><small>{row[config.columns[1].key]}</small></p><button><MoreHorizontal size={18}/></button></div><dl>{config.columns.slice(2, 5).map((column) => <div key={column.key}><dt>{column.label}</dt><dd>{row[column.key]}</dd></div>)}</dl><span className={`status ${statusClass(row.status)}`}>{row.status}</span></article>)}</div>
          </>
        ) : <div className="empty-state"><Search size={24}/><strong>No matching records</strong><p>Try a different search or clear the current filters.</p><button className="secondary-button" onClick={() => setQuery("")}>Reset search</button></div>}

        <footer className="table-footer"><span>Showing {filteredRows.length} of {rows.length} records</span><div><button disabled>Previous</button><button className="active">1</button><button>2</button><button>Next</button></div></footer>
      </section>

      {modalOpen && <div className="modal-backdrop" role="presentation" onMouseDown={() => setModalOpen(false)}><div className="modal-card" role="dialog" aria-modal="true" aria-labelledby="new-record-title" onMouseDown={(event) => event.stopPropagation()}><div className="modal-head"><div><h3 id="new-record-title">{config.action}</h3><p>Add the essential information now. More detail can be completed later.</p></div><button className="icon-button" onClick={() => setModalOpen(false)}><X size={18}/></button></div><form action={addRecord}><label>{config.columns[0].label}<input name="primary" required autoFocus placeholder={`Enter ${config.singular} name`} /></label><label>{config.columns[1].label}<input name="secondary" required placeholder={`Enter ${config.columns[1].label.toLowerCase()}`} /></label><label>Notes<textarea name="notes" rows={3} placeholder="Add a short note (optional)" /></label><p className="form-note">This information will be saved securely to the company workspace.</p><div className="modal-actions"><button type="button" className="secondary-button" onClick={() => setModalOpen(false)}>Cancel</button><button className="primary-button">Save {config.singular}</button></div></form></div></div>}
      {toast && <div className="toast"><b>✓</b>{toast}</div>}
    </div>
  );
}
