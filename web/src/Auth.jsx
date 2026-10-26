import { useEffect, useState } from "react";
import { API } from "./api.js";

export function AuthScreen({ setup, onAuthenticated }) {
  const [form, setForm] = useState({ nome: "", email: "", senha: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async e => {
    e.preventDefault(); setError(""); setBusy(true);
    try {
      const response = await fetch(`${API}/auth/${setup ? "setup" : "login"}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Não foi possível entrar.");
      onAuthenticated(result);
    } catch (err) { setError(err.message || "Não foi possível conectar à API."); }
    finally { setBusy(false); }
  };
  return <main className="auth-shell">
    <section className="auth-visual" aria-label="Sobre o sistema Perugine">
      <div className="auth-brand"><span className="logo">P</span><span>PERUGINE<small>GESTÃO IMOBILIÁRIA</small></span></div>
      <div className="auth-copy">
        <span className="eyebrow">GESTÃO IMOBILIÁRIA</span>
        <h1>Imóveis, pessoas e contratos em um só lugar.</h1>
        <p>Acompanhe a carteira e a rotina da equipe com informações organizadas por área.</p>
        <ul className="auth-feature-list">
          <li><span>01</span><div><b>Carteira de imóveis</b><small>Disponibilidade, localização e fotos.</small></div></li>
          <li><span>02</span><div><b>Agenda de visitas</b><small>Atendimentos, horários e responsáveis.</small></div></li>
          <li><span>03</span><div><b>Contratos e caixa</b><small>Cobranças, recebimentos e repasses.</small></div></li>
        </ul>
      </div>
      <small className="auth-disclaimer">Protótipo acadêmico local · use dados fictícios.</small>
    </section>
    <form className="auth-form" onSubmit={submit}>
      <div className="auth-form-inner">
        <span className="eyebrow">{setup ? "PRIMEIRO ACESSO" : "ACESSO À CONTA"}</span>
        <h2>{setup ? "Criar conta administradora" : "Entrar na Perugine"}</h2>
        <p>{setup ? "A primeira conta pode cadastrar a equipe e definir permissões." : "Use o e-mail e a senha da sua conta para continuar."}</p>
        <p className="form-required-note"><span aria-hidden="true">*</span> Campos obrigatórios</p>
        {setup && <label>Nome completo<input required autoComplete="name" value={form.nome} onChange={e => setForm({ ...form, nome: e.target.value })} placeholder="Seu nome"/></label>}
        <label>E-mail<input type="email" required autoComplete="username" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} placeholder="nome@exemplo.com"/></label>
        <label>Senha<input type="password" required minLength={setup ? 12 : undefined} autoComplete={setup ? "new-password" : "current-password"} value={form.senha} onChange={e => setForm({ ...form, senha: e.target.value })} placeholder={setup ? "Mínimo de 12 caracteres" : "Digite sua senha"}/></label>
        {error && <div className="form-error" role="alert" aria-live="assertive">{error}</div>}
        <button className="primary auth-submit" disabled={busy}>{busy ? "Aguarde…" : setup ? "Criar conta" : "Entrar"}</button>
        {setup && <small className="auth-note">A senha deve ter pelo menos 12 caracteres.</small>}
      </div>
    </form>
  </main>;
}

export function UserManagement({ currentUser }) {
  const [users, setUsers] = useState([]);
  const [search, setSearch] = useState("");
  const [dialog, setDialog] = useState(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const permissionGroups = [
    ["Painel", [{ key: "dashboard.view", label: "Visão geral" }]],
    ["Imóveis", [{ key: "properties.view", label: "Visualizar carteira" }, { key: "properties.manage", label: "Cadastrar e editar imóveis" }]],
    ["Clientes", [{ key: "clients.view", label: "Visualizar clientes e documentos" }, { key: "clients.manage", label: "Cadastrar e editar clientes" }]],
    ["Financeiro", [{ key: "finance.view", label: "Visualizar contratos, comissão e repasses" }, { key: "finance.manage", label: "Cadastrar locações e pagamentos" }]],
    ["Agenda", [{ key: "visits.view", label: "Visualizar agenda" }, { key: "visits.manage", label: "Agendar e atualizar visitas" }]],
    ["Administração", [{ key: "users.manage", label: "Gerenciar usuários e permissões" }]]
  ];
  const load = async () => { const response = await apiFetch(`${API}/usuarios`); if (response.ok) setUsers(await response.json()); else setMessage("Não foi possível carregar os usuários."); };
  useEffect(() => { load(); }, []);
  const save = async data => {
    setBusy(true); setMessage("");
    try {
      const response = await apiFetch(`${API}/usuarios${dialog.user ? `/${dialog.user.id}` : ""}`, { method: dialog.user ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Não foi possível salvar.");
      setDialog(null); await load();
    }
    finally { setBusy(false); }
  };
  const filtered = users.filter(user => `${user.nome} ${user.email} ${user.cargo}`.toLowerCase().includes(search.toLowerCase()));
  const active = users.filter(user => user.ativo).length;
  return <><div className="user-admin-banner"><div className="user-admin-mark">E</div><div><span className="eyebrow">ACESSO DA EQUIPE</span><h2>Contas da equipe</h2><p>Crie contas individuais e defina quais áreas cada pessoa pode consultar ou alterar.</p></div><button className="primary" onClick={() => setDialog({ user: null })}>＋ Novo usuário</button></div>
    {message && <div className="notice" role="alert">{message}<button onClick={() => setMessage("")}>×</button></div>}
    <div className="user-summary"><div><small>USUÁRIOS CADASTRADOS</small><b>{users.length}</b></div><div><small>ACESSOS ATIVOS</small><b>{active}</b></div><div><small>ADMINISTRADORES</small><b>{users.filter(user => user.ativo && user.permissoes["users.manage"]).length}</b></div><div className="user-summary-note"><span>◈</span> Cada integrante usa seu próprio acesso.</div></div>
    <div className="toolbar user-toolbar"><div><h2>Equipe Perugine</h2><p>{filtered.length} pessoa(s) encontrada(s)</p></div><label className="search-box"><span>⌕</span><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar por nome, e-mail ou cargo"/></label></div>
    <div className="user-table"><div className="user-table-head"><span>INTEGRANTE</span><span>CARGO</span><span>PERMISSÕES</span><span>SITUAÇÃO</span><span></span></div>{filtered.map(user => <article className="user-row" key={user.id}><div className="user-identity"><i>{user.nome.trim().split(/\s+/).slice(0, 2).map(part => part[0]).join("").toUpperCase()}</i><span><b>{user.nome}{user.id === currentUser.id && <em>Você</em>}</b><small>{user.email}</small></span></div><span className="user-role">{user.cargo}</span><span className="user-permission-count">{Object.values(user.permissoes).filter(Boolean).length} de {Object.keys(user.permissoes).length} acessos</span><span className={`user-state ${user.ativo ? "is-active" : "is-paused"}`}><i/>{user.ativo ? "Ativo" : "Inativo"}</span><button className="user-edit" onClick={() => setDialog({ user })}>Editar acessos <span>→</span></button></article>)}{!filtered.length && <div className="empty"><b>Nenhum usuário encontrado</b><p>Experimente outro termo de busca.</p></div>}</div>
    {dialog && <UserEditor user={dialog.user} busy={busy} permissionGroups={permissionGroups} onClose={() => setDialog(null)} onSave={save}/>}
  </>;
}

function UserEditor({ user, busy, permissionGroups, onClose, onSave }) {
  const [error, setError] = useState("");
  const allKeys = permissionGroups.flatMap(([, items]) => items.map(item => item.key));
  const [form, setForm] = useState({ nome: user?.nome || "", email: user?.email || "", cargo: user?.cargo || "CORRETOR", senha: "", ativo: user?.ativo ?? true, permissoes: Object.fromEntries(allKeys.map(key => [key, user ? Boolean(user.permissoes?.[key]) : ["dashboard.view", "properties.view", "properties.manage", "clients.view", "clients.manage", "visits.view", "visits.manage"].includes(key)])) });
  const toggle = key => setForm(current => ({ ...current, permissoes: { ...current.permissoes, [key]: !current.permissoes[key] } }));
  const preset = cargo => {
    const presets = {
      ADMINISTRADOR: Object.fromEntries(allKeys.map(key => [key, true])),
      GERENTE: Object.fromEntries(allKeys.map(key => [key, key !== "users.manage"])),
      CORRETOR: Object.fromEntries(allKeys.map(key => [key, ["dashboard.view", "properties.view", "properties.manage", "clients.view", "clients.manage", "visits.view", "visits.manage"].includes(key)])),
      FINANCEIRO: Object.fromEntries(allKeys.map(key => [key, ["dashboard.view", "properties.view", "clients.view", "finance.view", "finance.manage"].includes(key)])),
      PERSONALIZADO: form.permissoes
    };
    setForm(current => ({ ...current, cargo, permissoes: presets[cargo] }));
  };
  const submit = async event => {
    event.preventDefault(); setError("");
    try { await onSave(form); }
    catch (reason) { setError(reason?.message || "Não foi possível salvar os acessos. Confira os dados e tente novamente."); }
  };
  return <div className="overlay" onMouseDown={onClose}><section className="modal user-modal" onMouseDown={e => e.stopPropagation()}><div className="modal-title"><div><span className="eyebrow">EQUIPE · PERMISSÕES</span><h2>{user ? "Configurar acesso" : "Adicionar à equipe"}</h2></div><button aria-label="Fechar" onClick={onClose}>×</button></div><form className="form user-editor-form" onSubmit={submit}><p className="form-required-note"><span aria-hidden="true">*</span> Campos obrigatórios</p><div className="form-row"><label>Nome completo<input required value={form.nome} onChange={e => setForm({ ...form, nome: e.target.value })} placeholder="Nome do integrante"/></label><label>Cargo<select value={form.cargo} onChange={e => preset(e.target.value)}><option>ADMINISTRADOR</option><option>GERENTE</option><option>CORRETOR</option><option>FINANCEIRO</option><option>PERSONALIZADO</option></select></label></div><label>E-mail de acesso<input required type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} placeholder="nome@perugine.com.br"/></label><label>{user ? "Nova senha (opcional)" : "Senha inicial"}<input type="password" minLength={12} required={!user} value={form.senha} onChange={e => setForm({ ...form, senha: e.target.value })} placeholder="Mínimo de 12 caracteres"/><small className="field-help">A senha precisa ter pelo menos 12 caracteres.</small></label><div className="permissions-title"><div><b>Permissões</b><small>Escolha as áreas que este integrante pode acessar.</small></div><span>{Object.values(form.permissoes).filter(Boolean).length} selecionadas</span></div><div className="permission-grid">{permissionGroups.map(([group, items]) => <fieldset className="permission-group" key={group}><legend>{group}</legend>{items.map(item => <label className="permission-option" key={item.key}><input type="checkbox" checked={Boolean(form.permissoes[item.key])} onChange={() => toggle(item.key)}/><span><b>{item.label}</b><small>{item.key.endsWith(".manage") ? "Pode criar e alterar registros." : "Acesso para consultar informações."}</small></span></label>)}</fieldset>)}</div>{error && <p className="form-error" role="alert" aria-live="assertive">{error}</p>}{user && <label className="user-active-toggle"><input type="checkbox" checked={form.ativo} onChange={e => setForm({ ...form, ativo: e.target.checked })}/> Conta ativa</label>}<div className="form-actions"><button type="button" className="secondary" onClick={onClose}>Cancelar</button><button className="primary" disabled={busy}>{busy ? "Salvando…" : "Salvar acesso"}</button></div></form></section></div>;
}
