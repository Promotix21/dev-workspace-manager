import { useEffect, useState } from "react";
import * as api from "../api";
import type { ServerProfile } from "../types";

interface Props {
  onCancel: () => void;
}

export function ServersModal({ onCancel }: Props) {
  const [servers, setServers] = useState<ServerProfile[]>([]);
  const [editing, setEditing] = useState<ServerProfile | null>(null);
  const [secret, setSecret] = useState("");
  const [testResult, setTestResult] = useState<string | null>(null);

  const load = async () => {
    try {
      const list = await api.getServers();
      setServers(list);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing) return;
    try {
      await api.upsertServer(editing, secret.length > 0 ? secret : null);
      setEditing(null);
      setSecret("");
      load();
    } catch (e) {
      alert(`Save failed: ${e}`);
    }
  };

  const handleTest = async (id: string) => {
    try {
      const res = await api.testServerConnection(id);
      setTestResult(`Success: ${res}`);
    } catch (e) {
      setTestResult(`Failed: ${e}`);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete server?")) return;
    try {
      await api.deleteServer(id);
      load();
    } catch (e) {
      alert(`Delete failed: ${e}`);
    }
  };

  const openEdit = (s?: ServerProfile) => {
    if (s) {
      setEditing(s);
    } else {
      setEditing({
        id: `srv-${Math.random().toString(36).slice(2, 8)}`,
        name: "New Server",
        host: "example.com",
        port: 22,
        username: "root",
        auth_type: "key",
        remote_root: "/var/www/html",
        key_path: "~/.ssh/id_rsa",
        notes: "",
      });
    }
    setSecret("");
    setTestResult(null);
  };

  return (
    <div className="modal-backdrop" onMouseDown={onCancel}>
      <div className="modal modal-lg" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>Server Vault</h2>
          <button className="icon-btn" onClick={onCancel}>✕</button>
        </div>
        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '1rem', minHeight: '300px' }}>
          {!editing ? (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <p>Manage secure server profiles for AI context.</p>
                <button className="btn btn-primary" onClick={() => openEdit()}>+ Add Server</button>
              </div>
              <table style={{ width: '100%', textAlign: 'left', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)' }}>
                    <th style={{ padding: '8px' }}>Name</th>
                    <th style={{ padding: '8px' }}>Host</th>
                    <th style={{ padding: '8px' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {servers.map(s => (
                    <tr key={s.id} style={{ borderBottom: '1px solid var(--border-light)' }}>
                      <td style={{ padding: '8px' }}>{s.name}</td>
                      <td style={{ padding: '8px' }}>{s.username}@{s.host}:{s.port}</td>
                      <td style={{ padding: '8px' }}>
                        <button className="btn" style={{ marginRight: '4px' }} onClick={() => handleTest(s.id)}>Test</button>
                        <button className="btn" style={{ marginRight: '4px' }} onClick={() => openEdit(s)}>Edit</button>
                        <button className="btn" onClick={() => handleDelete(s.id)}>Delete</button>
                      </td>
                    </tr>
                  ))}
                  {servers.length === 0 && (
                    <tr><td colSpan={3} style={{ padding: '8px', opacity: 0.7 }}>No servers found.</td></tr>
                  )}
                </tbody>
              </table>
              {testResult && (
                <div style={{ marginTop: '10px', padding: '10px', background: 'var(--bg-dark)', borderRadius: '4px' }}>
                  {testResult}
                </div>
              )}
            </>
          ) : (
            <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div className="row">
                <div className="field grow">
                  <label>Profile Name</label>
                  <input required value={editing.name} onChange={e => setEditing({ ...editing, name: e.target.value })} />
                </div>
              </div>
              <div className="row">
                <div className="field grow">
                  <label>Host</label>
                  <input required value={editing.host} onChange={e => setEditing({ ...editing, host: e.target.value })} />
                </div>
                <div className="field">
                  <label>Port</label>
                  <input required type="number" value={editing.port} onChange={e => setEditing({ ...editing, port: Number(e.target.value) })} />
                </div>
              </div>
              <div className="row">
                <div className="field grow">
                  <label>Username</label>
                  <input required value={editing.username} onChange={e => setEditing({ ...editing, username: e.target.value })} />
                </div>
                <div className="field grow">
                  <label>Auth Type</label>
                  <select value={editing.auth_type} onChange={e => setEditing({ ...editing, auth_type: e.target.value as any })}>
                    <option value="key">SSH Key</option>
                    <option value="password">Password</option>
                    <option value="none">None</option>
                  </select>
                </div>
              </div>
              <div className="row">
                <div className="field grow">
                  <label>Secret (Password/Passphrase)</label>
                  <input type="password" placeholder="Leave blank to keep unchanged" value={secret} onChange={e => setSecret(e.target.value)} />
                  <small style={{ opacity: 0.7 }}>Stored securely in OS Keyring. Never saved in plaintext.</small>
                </div>
              </div>
              <div className="row">
                <div className="field grow">
                  <label>Remote Root Directory</label>
                  <input value={editing.remote_root} onChange={e => setEditing({ ...editing, remote_root: e.target.value })} />
                </div>
                {editing.auth_type === 'key' && (
                  <div className="field grow">
                    <label>SSH Key Path</label>
                    <input value={editing.key_path ?? ''} onChange={e => setEditing({ ...editing, key_path: e.target.value })} />
                  </div>
                )}
              </div>
              <div className="field">
                <label>Notes</label>
                <textarea value={editing.notes ?? ''} onChange={e => setEditing({ ...editing, notes: e.target.value })} />
              </div>
              <div className="modal-foot" style={{ marginTop: 'auto' }}>
                <button type="button" className="btn" onClick={() => { setEditing(null); setTestResult(null); }}>Cancel Edit</button>
                <button type="submit" className="btn btn-primary">Save Server</button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
