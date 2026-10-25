import { Fragment, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { API, apiFetch, can } from "./api.js";
import { AuthScreen, UserManagement } from "./Auth.jsx";

const brl = value => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(value || 0));
const localDateTime = value => new Date(value).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
const statusText = { DISPONIVEL: "Disponível", RESERVADO: "Reservado", ALUGADO: "Alugado", VENDIDO: "Vendido" };
const roleText = { PROPRIETARIO: "Proprietário", INQUILINO: "Inquilino", FIADOR: "Fiador", INTERESSADO: "Interessado", FUNCIONARIO: "Funcionário" };
const documentText = { CPF: "CPF", CNPJ: "CNPJ", RG: "RG", CNH: "CNH", OUTRO: "Outro" };
const attachmentTypes = ["DOCUMENTO_IDENTIDADE", "CPF_CNPJ", "COMPROVANTE_RESIDENCIA", "COMPROVANTE_RENDA", "CONTRATO", "OUTRO"];
const attachmentLabels = { DOCUMENTO_IDENTIDADE: "Documento de identidade", CPF_CNPJ: "CPF / CNPJ", COMPROVANTE_RESIDENCIA: "Comprovante de residência", COMPROVANTE_RENDA: "Comprovante de renda", CONTRATO: "Contrato", OUTRO: "Outro documento" };
const landingPage = user => can(user, "dashboard.view") ? "inicio" : can(user, "properties.view") ? "imoveis" : can(user, "clients.view") ? "clientes" : can(user, "visits.view") ? "agenda" : can(user, "finance.view") ? "financeiro" : "usuarios";
const pagePermission = { inicio: "dashboard.view", imoveis: "properties.view", clientes: "clients.view", agenda: "visits.view", financeiro: "finance.view", usuarios: "users.manage" };
const canOpenPage = (user, page) => page === "documentos" ? can(user, "clients.view") || can(user, "properties.view") : can(user, pagePermission[page]);
const screenGroups = [
  { id: "inicio", icon: "◫", label: "Visão geral", pages: ["inicio"] },
  { id: "cadastros", icon: "⌂", label: "Cadastros", pages: ["imoveis", "clientes", "documentos"] },
  { id: "financeiro", icon: "R$", label: "Contratos e caixa", pages: ["financeiro"] },
  { id: "operacao", icon: "▦", label: "Agenda e equipe", pages: ["agenda", "usuarios"] }
];

function ProtectedImage({ path, alt, className }) {
  const [source, setSource] = useState("");
  useEffect(() => {
    let active = true;
    let objectUrl;
    apiFetch(path).then(response => response.ok ? response.blob() : null).then(blob => {
      if (blob && active) { objectUrl = URL.createObjectURL(blob); setSource(objectUrl); }
    }).catch(() => {});
    return () => { active = false; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [path]);
  return source ? <img className={className} src={source} alt={alt}/> : <span className={`protected-image-loading ${className || ""}`} aria-label="Carregando imagem">⌂</span>;
}

async function openProtected(path) {
  const tab = window.open("about:blank", "_blank");
  try {
    const response = await apiFetch(path);
    if (!response.ok) throw new Error("Sem acesso a este arquivo.");
    const objectUrl = URL.createObjectURL(await response.blob());
    if (tab) tab.location.href = objectUrl;
    else { const link = document.createElement("a"); link.href = objectUrl; link.download = "arquivo-perugine"; link.click(); }
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
  } catch { tab?.close(); window.dispatchEvent(new CustomEvent("perugine:notice", { detail: "Não foi possível abrir este arquivo. Confira se ele ainda está anexado e tente novamente." })); }
}

function PhotoViewer({ photos, index, onClose, onIndexChange }) {
  useEffect(() => {
    const handleKey = event => {
      if (event.key === "Escape") onClose();
      if (event.key === "ArrowLeft") onIndexChange((index + photos.length - 1) % photos.length);
      if (event.key === "ArrowRight") onIndexChange((index + 1) % photos.length);
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [index, photos.length, onClose, onIndexChange]);
  const photo = photos[index];
  return createPortal(<div className="photo-viewer-overlay" role="dialog" aria-modal="true" aria-label="Visualização da foto do imóvel" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <div className="photo-viewer"><div className="photo-viewer-bar"><span><b>{photo?.nomeOriginal || "Foto do imóvel"}</b><small>{index + 1} de {photos.length}</small></span><button className="photo-viewer-close" aria-label="Fechar foto" onClick={onClose}>×</button></div>
      <div className="photo-viewer-stage">{photos.length > 1 && <button className="photo-viewer-arrow" aria-label="Foto anterior" onClick={() => onIndexChange((index + photos.length - 1) % photos.length)}>‹</button>}<ProtectedImage key={photo?.id} path={`${API}/arquivos/foto/${photo?.id}`} alt={photo?.nomeOriginal || "Foto do imóvel"} className="photo-viewer-image"/>{photos.length > 1 && <button className="photo-viewer-arrow" aria-label="Próxima foto" onClick={() => onIndexChange((index + 1) % photos.length)}>›</button>}</div>
      <div className="photo-viewer-hint">Use as setas do teclado para navegar · Esc para fechar</div>
    </div>
  </div>, document.body);
}

export default function App() {
  const [page, setPage] = useState("inicio");
  const [clients, setClients] = useState([]);
  const [homes, setHomes] = useState([]);
  const [visits, setVisits] = useState([]);
  const [inspections, setInspections] = useState([]);
  const [payments, setPayments] = useState([]);
  const [message, setMessage] = useState("");
  const [confirmAction, setConfirmAction] = useState(null);
  const [confirmError, setConfirmError] = useState("");
  const [confirmBusy, setConfirmBusy] = useState(false);
  const [dialog, setDialog] = useState("");
  const [editing, setEditing] = useState(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("TODOS");
  const [homeSort, setHomeSort] = useState("recentes");
  const [clientTypeFilter, setClientTypeFilter] = useState("TODOS");
  const [visitFilter, setVisitFilter] = useState("TODOS");
  const [busy, setBusy] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const [authMode, setAuthMode] = useState("checking");

  useEffect(() => {
    (async () => {
      const token = sessionStorage.getItem("perugineToken");
      if (token) {
        try {
          const response = await apiFetch(`${API}/auth/me`);
          if (response.ok) { const user = await response.json(); setCurrentUser(user); setPage(landingPage(user)); setAuthMode("ready"); return; }
        } catch { /* Exibe a tela de acesso se a sessão não puder ser validada. */ }
        sessionStorage.removeItem("perugineToken");
      }
      try {
        const response = await fetch(`${API}/auth/setup-status`);
        const result = await response.json();
        setAuthMode(result.required ? "setup" : "login");
      } catch { setAuthMode("login"); }
    })();
  }, []);

  useEffect(() => {
    const showNotice = event => setMessage(event.detail || "Não foi possível concluir a ação.");
    window.addEventListener("perugine:notice", showNotice);
    return () => window.removeEventListener("perugine:notice", showNotice);
  }, []);

  const refresh = async () => {
    try {
      const [c, h, v, f, i] = await Promise.all([
        can(currentUser, "clients.view") ? apiFetch(`${API}/clientes`) : Promise.resolve(null),
        can(currentUser, "properties.view") ? apiFetch(`${API}/imoveis`) : Promise.resolve(null),
        can(currentUser, "visits.view") ? apiFetch(`${API}/visitas`) : Promise.resolve(null),
        can(currentUser, "finance.view") ? apiFetch(`${API}/financeiro`) : Promise.resolve(null),
        can(currentUser, "properties.view") ? apiFetch(`${API}/vistorias`) : Promise.resolve(null)
      ]);
      const requests = [[c, "pessoas"], [h, "imóveis"], [v, "agenda"], [f, "financeiro"], [i, "vistorias"]];
      const failed = requests.find(([response]) => response && !response.ok);
      if (failed) {
        const [response, area] = failed;
        if (response.status === 401) {
          sessionStorage.removeItem("perugineToken");
          setCurrentUser(null);
          setAuthMode("login");
          setMessage("Sua sessão expirou. Entre novamente para carregar os dados.");
          return;
        }
        const details = await response.json().catch(() => ({}));
        setMessage(response.status === 403
          ? `Sua conta não tem permissão para carregar ${area}. Peça ao administrador para revisar os acessos.`
          : `Falha ao carregar ${area} (HTTP ${response.status}). ${details.error || "Atualize a tela; se persistir, informe esta mensagem."}`);
        return;
      }
      setClients(c ? await c.json() : []); setHomes(h ? await h.json() : []); setVisits(v ? await v.json() : []); setPayments(f ? await f.json() : []); setInspections(i ? await i.json() : []); setMessage("");
    } catch { setMessage("Não foi possível alcançar a API. Confira se ela está em execução e atualize a tela."); }
  };
  useEffect(() => { if (currentUser) refresh(); }, [currentUser]);

  const save = async (kind, payload) => {
    const data = payload.data ?? payload;
    const files = payload.files || [];
    const endpoint = kind === "cliente" ? "clientes" : kind === "imovel" ? "imoveis" : "visitas";
    setBusy(true);
    try {
      const response = await apiFetch(`${API}/${endpoint}${editing && kind !== "visita" ? `/${editing.id}` : ""}`, {
        method: editing && kind !== "visita" ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" }, body: JSON.stringify(data)
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Não foi possível salvar.");
      if (files.length) {
        setEditing(body);
        const fileEndpoint = kind === "cliente" ? `${API}/clientes/${body.id}/documentos` : `${API}/imoveis/${body.id}/fotos`;
        for (let start = 0; start < files.length; start += 20) {
          const part = files.slice(start, start + 20);
          const form = new FormData();
          part.forEach(item => form.append("files", item.file));
          if (kind === "cliente") form.append("categorias", JSON.stringify(part.map(item => item.categoria)));
          const upload = await apiFetch(fileEndpoint, { method: "POST", body: form });
          const result = await upload.json();
          if (!upload.ok) throw new Error(result.error || "Cadastro salvo, mas não foi possível enviar todos os arquivos.");
        }
      }
      setDialog(""); setEditing(null); await refresh();
    } finally { setBusy(false); }
  };

  const askConfirmation = action => { setConfirmError(""); setConfirmAction(action); };
  const runConfirmation = async () => {
    if (!confirmAction || confirmBusy) return;
    setConfirmBusy(true); setConfirmError("");
    try {
      const result = await confirmAction.onConfirm();
      if (result?.error) { setConfirmError(result.error); return; }
      if (result === false) { setConfirmError("Não foi possível concluir a ação. Confira os dados e tente novamente."); return; }
      setConfirmAction(null);
    } catch (error) { setConfirmError(error?.message || "Não foi possível concluir a ação. Tente novamente."); }
    finally { setConfirmBusy(false); }
  };
  const remove = async (kind, id) => {
    try {
      const response = kind === "visita"
        ? await apiFetch(`${API}/visitas/${id}/status`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "CANCELADA" }) })
        : await apiFetch(`${API}/${kind === "cliente" ? "clientes" : "imoveis"}/${id}`, { method: "DELETE" });
      if (!response.ok) { const body = await response.json().catch(() => ({})); return { error: body.error || (kind === "visita" ? "Não foi possível cancelar a visita." : "Não foi possível concluir a exclusão.") }; }
      await refresh();
      return true;
    } catch { return { error: "A API não respondeu. Confira a conexão e tente novamente." }; }
  };

  const updateVisit = async (id, status) => {
    const response = await apiFetch(`${API}/visitas/${id}/status`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) });
    if (!response.ok) { setMessage("Não foi possível atualizar a visita."); return; }
    await refresh();
  };

  const createContract = async data => {
    const response = await apiFetch(`${API}/contratos`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
    const result = await response.json();
    if (!response.ok) { setMessage(result.error || "Não foi possível cadastrar a locação."); return false; }
    setMessage("Locação cadastrada. A comissão e o repasse já aparecem na ficha financeira."); await refresh(); return true;
  };
  const createPayment = async (contractId, referencia) => {
    const response = await apiFetch(`${API}/financeiro/${contractId}/pagamentos`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ referencia }) });
    const result = await response.json();
    if (!response.ok) { setMessage(result.error || "Não foi possível lançar a cobrança."); return false; }
    await refresh(); return true;
  };
  const setPaymentStatus = async (id, status, details = {}) => {
    const response = await apiFetch(`${API}/financeiro/pagamentos/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status, ...details }) });
    const result = await response.json();
    if (!response.ok) { const error = result.error || "Não foi possível atualizar o pagamento."; setMessage(error); return { error }; }
    await refresh(); return result;
  };
  const applyAdjustment = async (id, data) => {
    const response = await apiFetch(`${API}/contratos/${id}/reajustes`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
    const result = await response.json();
    if (!response.ok) { setMessage(result.error || "Não foi possível registrar o reajuste."); return false; }
    setMessage(`Reajuste registrado. O novo aluguel é ${brl(result.valorNovo)}.`); await refresh(); return true;
  };
  const createInspection = async data => {
    const response = await apiFetch(`${API}/vistorias`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
    const result = await response.json();
    if (!response.ok) { setMessage(result.error || "Não foi possível registrar a vistoria."); return false; }
    await refresh(); return true;
  };
  const mutateHome = async (homeId, path, method, data) => {
    const response = await apiFetch(`${API}/imoveis/${homeId}${path}`, { method, headers: data ? { "Content-Type": "application/json" } : undefined, body: data ? JSON.stringify(data) : undefined });
    if (!response.ok) { const result = await response.json().catch(() => ({})); return { error: result.error || "Não foi possível atualizar a ficha do imóvel." }; }
    const homeResponse = await apiFetch(`${API}/imoveis`);
    if (homeResponse.ok) {
      const rows = await homeResponse.json(); setHomes(rows);
      const updated = rows.find(item => item.id === homeId); if (updated) setEditing(updated);
    }
    return true;
  };

  const query = search.trim().toLocaleLowerCase("pt-BR");
  const visibleHomes = useMemo(() => homes.filter(h => (statusFilter === "TODOS" || h.status === statusFilter) && `${h.codigo} ${h.titulo} ${h.endereco} ${h.cidade} ${h.status}`.toLocaleLowerCase("pt-BR").includes(query)).sort((a, b) => homeSort === "valor-menor" ? Number(a.valor) - Number(b.valor) : homeSort === "valor-maior" ? Number(b.valor) - Number(a.valor) : new Date(b.criadoEm) - new Date(a.criadoEm)), [homes, statusFilter, homeSort, query]);
  const visibleClients = useMemo(() => clients.filter(c => (clientTypeFilter === "TODOS" || c.tipo === clientTypeFilter) && `${c.nome} ${c.documento || ""} ${c.email || ""} ${c.telefone || ""} ${c.tipo}`.toLocaleLowerCase("pt-BR").includes(query)), [clients, clientTypeFilter, query]);
  const upcomingVisits = visits.filter(v => v.status === "AGENDADA" && new Date(v.inicio) >= new Date());
  const upcoming = upcomingVisits.slice(0, 4);
  const title = ({ inicio: "Visão geral", imoveis: "Imóveis", clientes: "Clientes", agenda: "Agenda de visitas", financeiro: "Financeiro", usuarios: "Usuários e acessos", documentos: "Documentos" })[page];
  const activeGroup = screenGroups.find(group => group.pages.includes(page));
  const newRecord = () => { setEditing(null); setDialog(page === "clientes" ? "cliente" : page === "agenda" ? "visita" : "imovel"); };
  const edit = (kind, record) => { setEditing(record); setDialog(kind); };

  if (authMode === "checking") return <div className="auth-loading"><span className="logo">P</span><p>Preparando seu espaço...</p></div>;
  if (!currentUser) return <AuthScreen setup={authMode === "setup"} onAuthenticated={result => { sessionStorage.setItem("perugineToken", result.token); setCurrentUser(result.usuario); setPage(landingPage(result.usuario)); setAuthMode("ready"); }}/ >;

  return <div className="layout">
    <aside className="sidebar">
      <div className="brand"><span className="logo">P</span><span>PERUGINE<small>GESTÃO IMOBILIÁRIA</small></span></div>
      <div className="label">MENU PRINCIPAL</div>
      {screenGroups.filter(group => group.pages.some(id => canOpenPage(currentUser, id))).map(group => {
        const targetPage = group.pages.find(id => canOpenPage(currentUser, id));
        return <button key={group.id} className={`nav ${activeGroup?.id === group.id ? "selected" : ""}`} aria-current={activeGroup?.id === group.id ? "page" : undefined} onClick={() => { setPage(targetPage); setSearch(""); }}><span>{group.icon}</span>{group.label}{group.id === "operacao" && upcomingVisits.length > 0 && <i className="nav-count">{upcomingVisits.length}</i>}</button>;
      })}
      <button className="user user-session" onClick={() => { sessionStorage.removeItem("perugineToken"); setCurrentUser(null); setAuthMode("login"); }}><i>{currentUser.nome.trim().split(/\s+/).slice(0, 2).map(part => part[0]).join("").toUpperCase()}</i><span>{currentUser.nome}<small>{currentUser.cargo} · Sair</small></span><b>↗</b></button>
    </aside>
    <main>
      <header><div className="breadcrumbs"><span>Perugine</span><b>/</b>{title}</div><div className="header-account"><i className="online-dot"/> <span>Olá, {currentUser.nome.split(" ")[0]}</span><i className="account-avatar">{currentUser.nome.trim().split(/\s+/).slice(0, 2).map(part => part[0]).join("").toUpperCase()}</i></div></header>
      <section className="content">
        {message && <div className="notice" role="alert">{message}<button onClick={() => setMessage("")}>×</button></div>}
        {activeGroup?.pages.length > 1 && <nav className="section-tabs" aria-label={activeGroup.id === "cadastros" ? "Seções de cadastros" : "Seções de operação"}>{activeGroup.pages.filter(id => canOpenPage(currentUser, id)).map(id => <button key={id} type="button" className={page === id ? "active" : ""} aria-current={page === id ? "page" : undefined} onClick={() => { setPage(id); setSearch(""); }}>{({ imoveis: "Imóveis", clientes: "Pessoas", documentos: "Documentos", agenda: "Agenda", usuarios: "Equipe e acessos" })[id]}</button>)}</nav>}
        <div className="intro"><div><span className="eyebrow">{page === "inicio" ? "PAINEL DE CONTROLE" : page === "clientes" ? "RELACIONAMENTO" : page === "agenda" ? "COMPROMISSOS" : page === "financeiro" ? "GESTÃO FINANCEIRA" : page === "usuarios" ? "ADMINISTRAÇÃO" : "CARTEIRA DE IMÓVEIS"}</span><h1>{page === "inicio" ? `Bom dia, ${currentUser.nome.split(" ")[0]}.` : title}</h1><p>{page === "inicio" ? "Uma visão clara do que acontece na Perugine hoje." : page === "clientes" ? "Conheça seus clientes e mantenha cada cadastro completo." : page === "agenda" ? "Organize as visitas e deixe cada atendimento no horário." : page === "financeiro" ? "Acompanhe aluguéis, comissão da imobiliária e repasses aos proprietários." : page === "usuarios" ? "Gerencie as contas e os acessos de cada integrante." : page === "documentos" ? "Consulte documentos de clientes e fotos dos imóveis em um só lugar." : "Encontre o imóvel certo e acompanhe cada oportunidade."}</p></div>
          {((page === "clientes" && can(currentUser, "clients.manage")) || (page === "agenda" && can(currentUser, "visits.manage")) || (page === "imoveis" && can(currentUser, "properties.manage"))) && <button className="primary" onClick={newRecord}>＋ {page === "clientes" ? "Novo cliente" : page === "agenda" ? "Agendar visita" : "Cadastrar imóvel"}</button>}</div>

        {page === "usuarios" && can(currentUser, "users.manage") && <UserManagement currentUser={currentUser}/>}

        {page === "inicio" && <Dashboard homes={homes} contracts={payments} visits={visits} canProperties={can(currentUser, "properties.view")} canClients={can(currentUser, "clients.view")} canVisits={can(currentUser, "visits.view")} canFinance={can(currentUser, "finance.view")} canFinanceManage={can(currentUser, "finance.manage")} onNavigate={setPage} onSetPaymentStatus={setPaymentStatus}/>}

        {page === "imoveis" && <>
          <div className="property-summary">{[["TODOS", "Todos os imóveis", homes.length], ["DISPONIVEL", "Disponíveis", homes.filter(home => home.status === "DISPONIVEL").length], ["RESERVADO", "Reservados", homes.filter(home => home.status === "RESERVADO").length], ["ALUGADO", "Alugados", homes.filter(home => home.status === "ALUGADO").length], ["VENDIDO", "Vendidos", homes.filter(home => home.status === "VENDIDO").length]].map(([status, label, count]) => <button type="button" key={status} className={statusFilter === status ? "active" : ""} onClick={() => setStatusFilter(status)}><span>{label}</span><b>{count}</b></button>)}</div>
          <div className="toolbar"><div><h2>Carteira de imóveis</h2><p>{visibleHomes.length} resultado(s) · fotos, vínculos e situação em um só lugar</p></div><div className="toolbar-controls"><SearchBox value={search} onChange={setSearch} label="Buscar por nome, código ou endereço"/><select className="filter-select" aria-label="Ordenar imóveis" value={homeSort} onChange={event => setHomeSort(event.target.value)}><option value="recentes">Mais recentes</option><option value="valor-menor">Menor valor</option><option value="valor-maior">Maior valor</option></select></div></div>
          <HomeGrid homes={visibleHomes} canManage={can(currentUser, "properties.manage")} onEdit={x => edit("imovel", x)} onRemove={home => askConfirmation({ title: "Excluir imóvel", description: `Deseja excluir ${home.titulo}? Se houver um contrato vinculado, o sistema vai impedir a exclusão e explicar o motivo aqui.`, confirmLabel: "Excluir imóvel", onConfirm: () => remove("imovel", home.id) })} onView={x => edit("ficha-imovel", x)}/>
          {!visibleHomes.length && <Empty title={homes.length ? "Nenhum resultado encontrado" : "Nenhum imóvel cadastrado"} text={homes.length ? "Tente outro termo ou altere o filtro de situação." : "Inclua um imóvel e comece a montar sua carteira."} action={can(currentUser, "properties.manage") ? "Cadastrar imóvel" : null} onAction={newRecord}/>}
        </>}

        {page === "documentos" && <DocumentsLibrary clients={clients} homes={homes} canClients={can(currentUser, "clients.view")} canProperties={can(currentUser, "properties.view")}/>}

        {page === "clientes" && <>
          <div className="people-summary"><div><span>CADASTROS ATIVOS</span><b>{clients.length}</b></div><div><span>PROPRIETÁRIOS</span><b>{clients.filter(client => client.tipo === "PROPRIETARIO").length}</b></div><div><span>INQUILINOS</span><b>{clients.filter(client => client.tipo === "INQUILINO").length}</b></div><div><span>INTERESSADOS</span><b>{clients.filter(client => client.tipo === "INTERESSADO").length}</b></div></div>
          <div className="toolbar"><div><h2>Base de pessoas</h2><p>{visibleClients.length} pessoa(s) correspondem aos filtros</p></div><SearchBox value={search} onChange={setSearch} label="Buscar por nome, documento ou contato"/></div>
          <nav className="people-filter" aria-label="Filtrar pessoas">{[["TODOS", "Todas"], ["PROPRIETARIO", "Proprietários"], ["INQUILINO", "Inquilinos"], ["FIADOR", "Fiadores"], ["INTERESSADO", "Interessados"], ["FUNCIONARIO", "Funcionários"]].map(([type, label]) => <button type="button" key={type} className={clientTypeFilter === type ? "active" : ""} onClick={() => setClientTypeFilter(type)}>{label}<span>{type === "TODOS" ? clients.length : clients.filter(client => client.tipo === type).length}</span></button>)}</nav>
          <div className="panel"><div className="table-head"><span>CLIENTE</span><span>PERFIL</span><span>DOCUMENTO</span><span>CONTATO</span><span>AÇÕES</span></div>
            {visibleClients.map(c => <div className="row" key={c.id}><div className="person"><i>{c.nome.slice(0, 1)}</i><span><b>{c.nome}</b><small>{c.email || "Sem e-mail cadastrado"}</small></span></div><span className="role">{roleText[c.tipo] || c.tipo}</span><span>{c.tipoDocumento ? `${documentText[c.tipoDocumento] || c.tipoDocumento} · ` : ""}{c.documento || "—"}</span><span>{c.telefone || "—"}</span><div className="actions"><button onClick={() => edit("ficha-cliente", c)}>Ficha</button>{can(currentUser, "clients.manage") && <><button onClick={() => edit("cliente", c)}>Editar</button><button onClick={() => askConfirmation({ title: "Inativar cadastro", description: `O cadastro de ${c.nome} será inativado e mantido no histórico.`, confirmLabel: "Inativar cadastro", onConfirm: () => remove("cliente", c.id) })}>Inativar</button></>}</div></div>)}
            {!visibleClients.length && <Empty title={clients.length ? "Nenhum resultado encontrado" : "Nenhum cliente cadastrado"} text={clients.length ? "Tente buscar por outro nome, documento ou contato." : "Cadastre clientes, proprietários, inquilinos e fiadores."} action={can(currentUser, "clients.manage") ? "Cadastrar cliente" : null} onAction={newRecord}/>}
          </div>
        </>}

        {page === "agenda" && <>
          <div className="agenda-overview"><div className="agenda-overview-icon">◷</div><div className="agenda-overview-copy"><span className="eyebrow">RESUMO DA AGENDA</span><h2>{upcomingVisits.length ? `${upcomingVisits.length} próxima(s) visita(s)` : "Tudo em dia"}</h2><p>{upcomingVisits.length ? "Acompanhe os próximos atendimentos e responsáveis." : "Não há visitas futuras no momento. Agende um atendimento para começar."}</p></div><div className="agenda-overview-metrics"><div><b>{upcomingVisits.length}</b><span>Próximas</span></div><div><b>{visits.filter(visit => visit.status === "AGENDADA").length}</b><span>Agendadas</span></div><div><b>{visits.filter(visit => visit.status === "REALIZADA").length}</b><span>Realizadas</span></div></div></div>
          <div className="toolbar agenda-schedule"><div><span className="eyebrow">ATENDIMENTOS</span><h2>Programação</h2><p>Visitas, horários e responsáveis.</p></div><label className="filter-wrap"><span>Situação</span><select className="filter-select" value={visitFilter} onChange={e => setVisitFilter(e.target.value)}><option value="TODOS">Todas</option><option value="AGENDADA">Agendadas</option><option value="REALIZADA">Realizadas</option><option value="CANCELADA">Canceladas</option></select></label></div>
          <VisitList visits={visits.filter(v => visitFilter === "TODOS" || v.status === visitFilter)} canManage={can(currentUser, "visits.manage")} onCancel={visit => askConfirmation({ title: "Cancelar visita", description: `A visita de ${visit.cliente?.nome || "cliente"} para ${visit.imovel?.titulo || "o imóvel"} será marcada como cancelada e ficará no histórico.`, confirmLabel: "Cancelar visita", onConfirm: () => remove("visita", visit.id) })} onComplete={id => updateVisit(id, "REALIZADA")}/>
          {!visits.filter(v => visitFilter === "TODOS" || v.status === visitFilter).length && <Empty title="Agenda livre" text="Você ainda não tem visitas nesta lista." action={can(currentUser, "visits.manage") ? "Agendar primeira visita" : null} onAction={newRecord}/>}
          {can(currentUser, "properties.view") && <InspectionPanel inspections={inspections} homes={homes} canManage={can(currentUser, "properties.manage")} onCreate={createInspection}/>}
        </>}

        {page === "financeiro" && can(currentUser, "finance.view") && <FinancialSheet contracts={payments} homes={homes} clients={clients} canManage={can(currentUser, "finance.manage")} onCreateContract={createContract} onCreatePayment={createPayment} onSetPaymentStatus={setPaymentStatus} onApplyAdjustment={applyAdjustment}/>}
      </section>
    </main>
    {dialog && <Modal title={modalTitle(dialog, editing)} close={() => { setDialog(""); setEditing(null); }} wide={dialog.startsWith("ficha-") || dialog === "imovel" || dialog === "cliente"}>
      {dialog === "cliente" && <ClientForm initial={editing} onCancel={() => setDialog("")} onSave={data => save("cliente", data)} busy={busy}/>}
      {dialog === "imovel" && <HomeForm initial={editing} onCancel={() => setDialog("")} onSave={data => save("imovel", data)} busy={busy}/>}
      {dialog === "visita" && <VisitForm homes={homes.filter(h => h.status === "DISPONIVEL" || h.status === "RESERVADO")} clients={clients} onCancel={() => setDialog("")} onSave={data => save("visita", data)} busy={busy}/>}
      {dialog === "ficha-cliente" && <ClientSheet client={editing} canManage={can(currentUser, "clients.manage")} onDeleteDocument={(clientId, document) => askConfirmation({ title: "Remover documento", description: `O arquivo “${document.nomeOriginal}” será removido do cadastro.`, confirmLabel: "Remover documento", onConfirm: () => deleteDocument(clientId, document.id) })}/>}
      {dialog === "ficha-imovel" && <HomeSheet home={editing} clients={clients.filter(client => client.tipo === "INTERESSADO")} canManage={can(currentUser, "properties.manage")} canFinance={can(currentUser, "finance.view")} onOpenFinance={() => { setDialog(""); setPage("financeiro"); }} onDeletePhoto={(homeId, photo) => askConfirmation({ title: "Remover foto", description: `A foto “${photo.nomeOriginal}” será removida deste imóvel.`, confirmLabel: "Remover foto", onConfirm: () => deletePhoto(homeId, photo.id) })} onMutate={mutateHome} onAskConfirmation={askConfirmation}/>}
    </Modal>}
    {confirmAction && <ConfirmDialog action={confirmAction} error={confirmError} busy={confirmBusy} onCancel={() => { if (!confirmBusy) { setConfirmAction(null); setConfirmError(""); } }} onConfirm={runConfirmation}/>}
  </div>;

  async function deletePhoto(homeId, photoId) {
    try {
    const response = await apiFetch(`${API}/imoveis/${homeId}/fotos/${photoId}`, { method: "DELETE" });
    if (!response.ok) { const body = await response.json().catch(() => ({})); return { error: body.error || "Não foi possível remover a foto." }; }
    await refresh();
    if (editing?.id === homeId) { const latest = await apiFetch(`${API}/imoveis`); if (latest.ok) setEditing((await latest.json()).find(row => row.id === homeId)); }
    return true;
    } catch { return { error: "A API não respondeu. Confira a conexão e tente novamente." }; }
  }
  async function deleteDocument(clientId, documentId) {
    try {
    const response = await apiFetch(`${API}/clientes/${clientId}/documentos/${documentId}`, { method: "DELETE" });
    if (!response.ok) { const body = await response.json().catch(() => ({})); return { error: body.error || "Não foi possível remover o documento." }; }
    await refresh();
    if (editing?.id === clientId) { const latest = await apiFetch(`${API}/clientes`); if (latest.ok) setEditing((await latest.json()).find(row => row.id === clientId)); }
    return true;
    } catch { return { error: "A API não respondeu. Confira a conexão e tente novamente." }; }
  }
}

function ConfirmDialog({ action, error, busy, onCancel, onConfirm }) {
  useEffect(() => {
    const closeOnEscape = event => { if (event.key === "Escape" && !busy) onCancel(); };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [busy, onCancel]);
  return createPortal(<div className="confirm-overlay" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget && !busy) onCancel(); }}><section className="confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title" aria-describedby="confirm-description"><div className="confirm-icon">!</div><span className="eyebrow">CONFIRMAÇÃO</span><h2 id="confirm-title">{action.title}</h2><p id="confirm-description">{action.description}</p>{error && <div className="confirm-error" role="alert"><b>Não foi possível concluir</b><span>{error}</span></div>}<div className="confirm-actions"><button type="button" className="secondary" autoFocus disabled={busy} onClick={onCancel}>Voltar</button><button type="button" className="danger-button" disabled={busy} onClick={onConfirm}>{busy ? "Aguarde…" : action.confirmLabel || "Confirmar"}</button></div></section></div>, document.body);
}

function modalTitle(dialog, editing) {
  if (dialog === "ficha-cliente") return "Ficha do cliente";
  if (dialog === "ficha-imovel") return "Ficha do imóvel";
  if (dialog === "visita") return "Agendar visita";
  return `${editing ? "Editar" : "Novo"} ${dialog === "cliente" ? "cliente" : "imóvel"}`;
}
function DocumentsLibrary({ clients, homes, canClients, canProperties }) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("TODOS");
  const documents = [
    ...(canClients ? clients.flatMap(client => (client.anexos || []).map(file => ({ ...file, owner: client.nome, detail: roleText[client.tipo] || client.tipo, kind: "documento", category: attachmentLabels[file.categoria] || file.categoria }))) : []),
    ...(canProperties ? homes.flatMap(home => (home.fotos || []).map(file => ({ ...file, owner: `${home.codigo} · ${home.titulo}`, detail: `${home.endereco} · ${home.cidade}`, kind: "foto", category: "Foto do imóvel" }))) : [])
  ].sort((a, b) => new Date(b.criadoEm) - new Date(a.criadoEm));
  const search = query.trim().toLocaleLowerCase("pt-BR");
  const visible = documents.filter(file => (category === "TODOS" || file.kind === category) && `${file.nomeOriginal} ${file.owner} ${file.detail} ${file.category}`.toLocaleLowerCase("pt-BR").includes(search));
  return <>
    <div className="toolbar"><div><h2>Arquivos da carteira</h2><p>{visible.length} de {documents.length} arquivo(s) disponíveis para esta conta</p></div><div className="toolbar-controls"><SearchBox value={query} onChange={setQuery} label="Buscar arquivo, pessoa ou imóvel"/><select className="filter-select" value={category} onChange={event => setCategory(event.target.value)} aria-label="Filtrar arquivos"><option value="TODOS">Todos os arquivos</option>{canClients && <option value="documento">Documentos de pessoas</option>}{canProperties && <option value="foto">Fotos de imóveis</option>}</select></div></div>
    <div className="document-library"><div className="document-library-head"><span>ARQUIVO</span><span>CADASTRO VINCULADO</span><span>CATEGORIA</span><span>ADICIONADO EM</span><span></span></div>{visible.map(file => <article key={`${file.kind}-${file.id}`}><div className="document-library-name"><i>{file.mimeType === "application/pdf" ? "PDF" : file.kind === "foto" ? "IMG" : "DOC"}</i><span><b>{file.nomeOriginal}</b><small>{file.mimeType === "application/pdf" ? "Documento PDF" : file.kind === "foto" ? "Imagem do imóvel" : "Imagem digitalizada"}</small></span></div><span className="document-library-owner"><b>{file.owner}</b><small>{file.detail}</small></span><span>{file.category}</span><time>{new Date(file.criadoEm).toLocaleDateString("pt-BR")}</time><button className="secondary" onClick={() => openProtected(`${API}/arquivos/${file.kind}/${file.id}`)}>Abrir ↗</button></article>)}{!visible.length && <Empty title={documents.length ? "Nenhum arquivo encontrado" : "Nenhum arquivo cadastrado"} text={documents.length ? "Tente outro termo ou filtro." : "Os anexos de pessoas e as fotos dos imóveis aparecem nesta área."}/>}</div>
  </>;
}

function Dashboard({ homes, contracts, visits, canProperties, canClients, canVisits, canFinance, canFinanceManage, onNavigate, onSetPaymentStatus }) {
  const now = new Date();
  const dayKey = date => {
    const value = new Date(date);
    return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
  };
  const currentRef = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const allPayments = contracts.flatMap(contract => (contract.pagamentos || []).map(payment => ({ ...payment, contract })));
  const overdue = allPayments.filter(payment => payment.status !== "PAGO" && new Date(payment.vencimento) < now);
  const overdueAmount = overdue.reduce((sum, payment) => sum + Number(payment.valor), 0);
  const receivedMonth = allPayments.filter(payment => payment.status === "PAGO" && payment.referencia === currentRef).reduce((sum, payment) => sum + Number(payment.valor), 0);
  const receivedToday = allPayments.filter(payment => payment.status === "PAGO" && payment.pagoEm && dayKey(payment.pagoEm) === dayKey(now)).reduce((sum, payment) => sum + Number(payment.valor), 0);
  const occupied = homes.filter(home => home.status === "ALUGADO").length;
  const expiring = contracts.filter(contract => {
    const end = new Date(contract.fim);
    const days = (end - now) / 86400000;
    return days >= 0 && days <= 60;
  }).sort((a, b) => new Date(a.fim) - new Date(b.fim));
  const todayVisits = visits.filter(visit => visit.status === "AGENDADA" && dayKey(visit.inicio) === dayKey(now)).sort((a, b) => new Date(a.inicio) - new Date(b.inicio));
  const metrics = [
    ...(canProperties ? [{ label: "Imóveis ocupados", value: `${occupied} de ${homes.length}`, hint: `${homes.length - occupied} disponíveis ou em negociação`, tone: "green", onClick: () => onNavigate("imoveis") }] : []),
    ...(canFinance ? [{ label: "Recebido no mês", value: brl(receivedMonth), hint: `${allPayments.filter(payment => payment.status === "PAGO" && payment.referencia === currentRef).length} pagamentos confirmados`, tone: "sage", onClick: () => onNavigate("financeiro") }] : []),
    ...(canFinance ? [{ label: "Cobranças em atraso", value: brl(overdueAmount), hint: `${overdue.length} cobrança(s) aguardando`, tone: overdue.length ? "red" : "sand", onClick: () => onNavigate("financeiro") }] : []),
    ...(canFinance ? [{ label: "Contratos a vencer", value: expiring.length, hint: "Nos próximos 60 dias", tone: "blue", onClick: () => onNavigate("financeiro") }] : [])
  ];
  return <div className="dashboard-view">
    <div className="dashboard-kpis">{metrics.map(metric => <button key={metric.label} className={`dashboard-kpi kpi-${metric.tone}`} onClick={metric.onClick}><span>{metric.label}</span><b>{metric.value}</b><small>{metric.hint}<i>→</i></small></button>)}</div>
    <div className="dashboard-primary-grid">
      {canFinance && <section className="dashboard-panel attention-panel"><div className="dashboard-panel-head"><div><span className="eyebrow">ACOMPANHAMENTO FINANCEIRO</span><h2>O que precisa de atenção</h2></div><span className={`dashboard-badge ${overdue.length ? "badge-warning" : "badge-success"}`}>{overdue.length} pendência(s)</span></div>
        {overdue.length ? <><div className="overdue-summary"><b>{overdue.length} cobrança(s) em atraso · {brl(overdueAmount)}</b><span>Confira o histórico antes de registrar um recebimento.</span></div><div className="attention-list">{overdue.slice(0, 4).map(payment => <article key={payment.id}><span><b>{payment.contract.inquilino?.nome || "Inquilino"} · {payment.contract.imovel?.codigo || payment.contract.numero}</b><small>Vencimento {new Date(payment.vencimento).toLocaleDateString("pt-BR")} · {payment.referencia}</small></span><strong>{brl(payment.valor)}</strong>{canFinanceManage && <button onClick={() => onNavigate("financeiro")}>Registrar no financeiro</button>}</article>)}</div><button className="secondary" onClick={() => onNavigate("financeiro")}>Consultar cobranças</button></> : <div className="dashboard-empty-state"><b>Carteira em dia</b><span>Nenhuma cobrança vencida foi encontrada.</span></div>}
      </section>}
      {canVisits && <section className="dashboard-panel today-panel"><div className="dashboard-panel-head"><div><span className="eyebrow">{now.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" })}</span><h2>Agenda de hoje</h2></div><button className="link" onClick={() => onNavigate("agenda")}>Abrir agenda <span>→</span></button></div>
        {todayVisits.length ? <div className="today-list">{todayVisits.slice(0, 5).map(visit => <article key={visit.id}><time>{new Date(visit.inicio).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</time><span><b>{visit.imovel?.codigo || "Visita"} · {visit.imovel?.titulo}</b><small>{visit.cliente?.nome || "Cliente"}{visit.corretor ? ` · ${visit.corretor}` : ""}</small></span></article>)}</div> : <div className="dashboard-empty-state"><b>Agenda livre por enquanto</b><span>As visitas marcadas para hoje aparecem aqui.</span></div>}
      </section>}
    </div>
    <div className="dashboard-secondary-grid">
      {canFinance && <section className="dashboard-panel expirations-panel"><div className="dashboard-panel-head"><div><span className="eyebrow">RENOVAÇÕES</span><h2>Próximos vencimentos de contrato</h2></div></div>
        {expiring.length ? <><div className="expiration-table"><div><span>CONTRATO / INQUILINO</span><span>TÉRMINO</span><span>AÇÃO</span></div>{expiring.slice(0, 4).map(contract => <article key={contract.id}><span><b>{contract.numero} · {contract.inquilino?.nome}</b><small>{contract.imovel?.codigo} · {contract.imovel?.titulo}</small></span><time>{new Date(contract.fim).toLocaleDateString("pt-BR")}</time><button onClick={() => onNavigate("financeiro")}>Revisar renovação</button></article>)}</div><button className="secondary" onClick={() => onNavigate("financeiro")}>Ver contratos e reajustes</button></> : <div className="dashboard-empty-state"><b>Nenhum contrato próximo do vencimento</b><span>Os contratos que vencem nos próximos 60 dias aparecerão aqui.</span></div>}
      </section>}
      {canFinance && <section className="dashboard-panel cash-panel"><div className="dashboard-panel-head"><div><span className="eyebrow">RESUMO DE RECEBIMENTOS</span><h2>Caixa de hoje</h2></div><span className="dashboard-badge badge-success">{allPayments.filter(payment => payment.status === "PAGO" && payment.pagoEm && dayKey(payment.pagoEm) === dayKey(now)).length} recebimento(s)</span></div><b className="cash-total">{brl(receivedToday)}</b><p>Pagamentos registrados hoje</p><div className="cash-split"><span>Comissão da imobiliária <b>{brl(receivedToday * 0.1)}</b></span><span>Repasse aos proprietários <b>{brl(receivedToday * 0.9)}</b></span></div><button className="secondary" onClick={() => onNavigate("financeiro")}>Abrir contratos e caixa</button></section>}
    </div>
    {!metrics.length && !canClients && <Empty title="Acesso limitado" text="Peça à administração acesso às áreas que você precisa consultar."/>}
  </div>;
}

function Stat({ label, value, icon, hint, tone, onClick }) { return <button className={`stat stat-${tone}`} onClick={onClick}><span className="stat-top">{label}<i>{icon}</i></span><strong>{value}</strong><small>{hint}<b>→</b></small></button>; }
function Empty({ title, text, action, onAction }) { return <div className="empty"><i>⌂</i><b>{title}</b><p>{text}</p>{action && <button className="secondary" onClick={onAction}>{action}</button>}</div>; }
function SearchBox({ value, onChange, label }) { return <label className="search-box"><span>⌕</span><input value={value} onChange={e => onChange(e.target.value)} placeholder={label}/>{value && <button type="button" aria-label="Limpar busca" onClick={() => onChange("")}>×</button>}</label>; }

function HomeGrid({ homes, onEdit, onRemove, onView, canManage }) {
  return <div className="grid">{homes.map(h => <article className="home" key={h.id}>
    <button className="home-image" onClick={() => onView(h)} aria-label={`Abrir ficha de ${h.titulo}`}>
      {h.fotos?.[0] ? <ProtectedImage path={`${API}/arquivos/foto/${h.fotos[0].id}`} alt={h.titulo}/> : <span className="image-placeholder"><i>⌂</i><small>IMÓVEL PERUGINE</small></span>}
      <b className={`status status-${h.status.toLowerCase()}`}>{statusText[h.status] || h.status}</b>
      {h.fotos?.length > 0 && <span className="photo-count">▧ {h.fotos.length}</span>}
    </button>
    <div className="home-info"><div className="home-code">{h.codigo}</div><h3>{h.titulo}</h3><p className="home-address">⌖ &nbsp;{h.endereco} · {h.cidade}</p>
      <div className="home-features">{h.tipo && <span>{h.tipo}</span>}{h.quartos > 0 && <span>♧ &nbsp;{h.quartos} quartos</span>}</div>
      <div className="home-foot"><strong>{brl(h.valor)}<small>{h.status === "ALUGADO" ? "por mês" : h.status === "VENDIDO" ? "valor de venda" : "valor anunciado"}</small></strong><div><button onClick={() => onView(h)}>Ver ficha</button>{canManage && <><button onClick={() => onEdit(h)}>Editar imóvel</button><button aria-label={`Excluir ${h.titulo}`} onClick={() => onRemove(h)}>Excluir</button></>}</div></div>
    </div>
  </article>)}</div>;
}

function VisitList({ visits, onCancel, onComplete, compact = false, canManage = true }) {
  if (!visits.length) return <div className="agenda-empty"><span>◷</span><div><b>Nenhuma visita agendada</b><small>Quando houver uma visita marcada, ela aparecerá aqui.</small></div></div>;
  return <div className={`visit-list ${compact ? "visit-list-compact" : ""}`}>{visits.map(v => {
    const date = new Date(v.inicio);
    return <article className="visit-card" key={v.id}><div className="visit-date"><small>{date.toLocaleDateString("pt-BR", { weekday: "short" }).replace(".", "")}</small><b>{date.toLocaleDateString("pt-BR", { day: "2-digit" })}</b><span>{date.toLocaleDateString("pt-BR", { month: "short" }).replace(".", "")}</span></div><div className="visit-time"><small>HORÁRIO</small><b>{date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</b></div><div className="visit-main"><b>{v.imovel?.titulo || "Imóvel"}</b><span>{v.imovel?.endereco} · {v.imovel?.cidade}</span><div className="visit-meta"><span><small>CLIENTE</small>{v.cliente?.nome || "—"}</span>{v.corretor && <span><small>RESPONSÁVEL</small>{v.corretor}</span>}</div>{v.observacoes && <small className="visit-note">{v.observacoes}</small>}</div><span className={`visit-status visit-${v.status.toLowerCase()}`}>{({ AGENDADA: "Agendada", REALIZADA: "Realizada", CANCELADA: "Cancelada" })[v.status] || v.status}</span><div className="visit-actions">{canManage && v.status === "AGENDADA" && <><button className="visit-complete" aria-label="Marcar visita como realizada" onClick={() => onComplete(v.id)}><span>✓</span> Concluir visita</button><button className="visit-cancel" aria-label="Cancelar visita" onClick={() => onCancel(v)}>Cancelar</button></>}</div></article>;
  })}</div>;
}

function ClientSheet({ client, onDeleteDocument, canManage }) {
  return <div className="sheet"><div className="sheet-person"><i>{client.nome.slice(0, 1)}</i><div><h3>{client.nome}</h3><span className="role">{roleText[client.tipo] || client.tipo}</span></div><span className="active-pill"><i/> Ativo</span></div>
    <div className="sheet-grid"><SheetItem label="Documento principal" value={`${documentText[client.tipoDocumento] || "Documento"} · ${client.documento || "Não informado"}`}/><SheetItem label="Telefone" value={client.telefone || "Não informado"}/><SheetItem label="E-mail" value={client.email || "Não informado"}/><SheetItem label="Cadastro" value={localDateTime(client.criadoEm)}/></div>
    <section className="attachment-section"><div className="attachment-heading"><div><span className="eyebrow">ARQUIVOS DO CADASTRO</span><h3>Documentos anexados</h3></div><span>{client.anexos?.length || 0} arquivo(s)</span></div>
      {client.anexos?.length ? <div className="attachment-list">{client.anexos.map(doc => <div className="attachment-item" key={doc.id}><span className="file-icon">{doc.mimeType === "application/pdf" ? "PDF" : "IMG"}</span><div><b>{doc.nomeOriginal}</b><small>{attachmentLabels[doc.categoria] || doc.categoria} · {localDateTime(doc.criadoEm)}</small></div><button className="attachment-open" onClick={() => openProtected(`${API}/arquivos/documento/${doc.id}`)}>Abrir ↗</button>{canManage && <button aria-label={`Remover ${doc.nomeOriginal}`} onClick={() => onDeleteDocument(client.id, doc)}>×</button>}</div>)}</div> : <p className="attachment-empty">Nenhum documento anexado.</p>}
    </section>
  </div>;
}
function HomeSheet({ home, clients, onDeletePhoto, onMutate, onAskConfirmation, canManage, canFinance, onOpenFinance }) {
  const [photoIndex, setPhotoIndex] = useState(null);
  return <div className="sheet"><div className="home-sheet-heading"><div><span className="home-code">{home.codigo}</span><h3>{home.titulo}</h3><p>{home.endereco} · {home.cidade}</p></div><span className={`status status-${home.status.toLowerCase()}`}>{statusText[home.status] || home.status}</span></div>
    <div className="sheet-grid"><SheetItem label="Tipo" value={home.tipo || "Não informado"}/><SheetItem label="Quartos" value={home.quartos}/><SheetItem label={home.status === "ALUGADO" ? "Aluguel mensal" : "Valor anunciado"} value={brl(home.valor)}/><SheetItem label="Cadastro" value={localDateTime(home.criadoEm)}/></div>
    {home.observacoes && <div className="home-observations"><b>Observações</b><p>{home.observacoes}</p></div>}
    <PropertyOperations home={home} clients={clients} canManage={canManage} canFinance={canFinance} onOpenFinance={onOpenFinance} onMutate={onMutate} onAskConfirmation={onAskConfirmation}/>
    <section className="attachment-section"><div className="attachment-heading"><div><span className="eyebrow">GALERIA DO IMÓVEL</span><h3>Fotos</h3></div><span>{home.fotos?.length || 0} foto(s)</span></div>
      {home.fotos?.length ? <div className="photo-gallery">{home.fotos.map((photo, index) => <div className="gallery-photo" key={photo.id}><button className="gallery-open" aria-label={`Ampliar ${photo.nomeOriginal}`} onClick={() => setPhotoIndex(index)}><ProtectedImage path={`${API}/arquivos/foto/${photo.id}`} alt={photo.nomeOriginal}/><span className="gallery-zoom-hint">Ampliar foto ⤢</span></button>{canManage && <button aria-label={`Remover ${photo.nomeOriginal}`} onClick={() => onDeletePhoto(home.id, photo)}>×</button>}</div>)}</div> : <p className="attachment-empty">Ainda não há fotos para este imóvel.</p>}
    </section>
    {photoIndex !== null && <PhotoViewer photos={home.fotos} index={photoIndex} onClose={() => setPhotoIndex(null)} onIndexChange={setPhotoIndex}/>}
  </div>;
}

function PropertyOperations({ home, clients, canManage, canFinance, onOpenFinance, onMutate, onAskConfirmation }) {
  const [keyForm, setKeyForm] = useState({ numero: "", localizacao: "" });
  const [interestForm, setInterestForm] = useState({ clienteId: "", prioridade: "3", observacoes: "" });
  const [withdrawal, setWithdrawal] = useState({});
  const [error, setError] = useState("");
  const people = home.contratos?.flatMap(contract => [
    { id: `tenant-${contract.id}`, label: "Inquilino", name: contract.inquilino?.nome, phone: contract.inquilino?.telefone },
    { id: `owner-${contract.id}`, label: "Proprietário", name: contract.proprietario?.nome, phone: contract.proprietario?.telefone }
  ]) || [];
  const update = async (...args) => { setError(""); const saved = await onMutate(...args); if (saved?.error) { setError(saved.error); return false; } if (!saved) { setError("A alteração não foi salva. Tente novamente."); return false; } return true; };
  return <div className="property-operations">
    <section className="property-related property-contract-section"><div className="attachment-heading"><div><span className="eyebrow">VÍNCULOS E DISPONIBILIDADE</span><h3>Contrato de locação</h3></div>{home.contratos?.length ? <span className="contract-status-pill">Vigente</span> : <span className="contract-status-pill contract-status-empty">Sem contrato</span>}</div>
      {home.contratos?.length ? <div className="property-contract-list">{home.contratos.map(contract => <article key={contract.id}><div className="property-contract-heading"><b>{contract.numero}</b><span>{brl(contract.valorAluguel)}<small>aluguel mensal</small></span></div><div className="property-contract-people"><span><small>INQUILINO</small><b>{contract.inquilino?.nome || "—"}</b></span><span><small>PROPRIETÁRIO</small><b>{contract.proprietario?.nome || "—"}</b></span></div><div className="property-contract-dates">Vigência: {new Date(contract.inicio).toLocaleDateString("pt-BR")} a {new Date(contract.fim).toLocaleDateString("pt-BR")}</div>{canFinance && <button type="button" className="secondary" onClick={onOpenFinance}>Abrir contrato e ficha financeira ↗</button>}</article>)}</div> : <p className="attachment-empty">Este imóvel ainda não está vinculado a uma locação ativa.{canManage ? " Crie a locação em Contratos e caixa para acompanhar pagamentos e reajustes." : ""}</p>}
    </section>
    <section className="property-related"><div className="attachment-heading"><div><span className="eyebrow">VÍNCULOS</span><h3>Pessoas relacionadas</h3></div><span>{people.length} vínculo(s)</span></div>
      {people.length ? <div className="related-people">{people.map(person => <article key={person.id}><i>{person.name?.slice(0, 1) || "P"}</i><span><b>{person.name}</b><small>{person.label}{person.phone ? ` · ${person.phone}` : ""}</small></span></article>)}</div> : <p className="attachment-empty">Este imóvel ainda não está vinculado a uma locação ativa.</p>}
    </section>
    <section className="property-related"><div className="attachment-heading"><div><span className="eyebrow">CONTROLE DE ACESSO</span><h3>Chaves</h3></div><span>{home.chaves?.filter(key => key.status === "RETIRADA").length || 0} retirada(s)</span></div>
      {home.chaves?.length ? <div className="key-list">{home.chaves.map(key => <article key={key.id}><span className={`key-state ${key.status === "RETIRADA" ? "key-out" : ""}`}>{key.status === "RETIRADA" ? "Com alguém" : "Disponível"}</span><div><b>Chave {key.numero}</b><small>{key.localizacao || "Localização não informada"}{key.status === "RETIRADA" ? ` · Retirada por ${key.retiradaPor || "—"} em ${localDateTime(key.retiradaEm)}` : ""}{key.devolvidaEm ? ` · Última devolução ${localDateTime(key.devolvidaEm)}` : ""}</small></div>{canManage && (key.status === "RETIRADA" ? <button className="secondary" type="button" onClick={() => update(`/chaves/${key.id}`, "PATCH", { acao: "DEVOLVER" })}>Registrar devolução</button> : <form className="key-withdrawal" onSubmit={event => { event.preventDefault(); update(`/chaves/${key.id}`, "PATCH", { acao: "RETIRAR", retiradaPor: withdrawal[key.id] }); }}><input required aria-label={`Quem retirou a chave ${key.numero}`} value={withdrawal[key.id] || ""} onChange={event => setWithdrawal({ ...withdrawal, [key.id]: event.target.value })} placeholder="Quem vai retirar?"/><button type="submit">Retirar</button></form>)}</article>)}</div> : <p className="attachment-empty">Nenhuma chave cadastrada para este imóvel.</p>}
      {canManage && <form className="key-add-form" onSubmit={async event => { event.preventDefault(); if (await update("/chaves", "POST", keyForm)) setKeyForm({ numero: "", localizacao: "" }); }}><input required maxLength={40} value={keyForm.numero} onChange={event => setKeyForm({ ...keyForm, numero: event.target.value })} placeholder="Número ou identificação"/><input value={keyForm.localizacao} onChange={event => setKeyForm({ ...keyForm, localizacao: event.target.value })} placeholder="Onde fica guardada?"/><button className="secondary">＋ Adicionar chave</button></form>}
    </section>
    <section className="property-related"><div className="attachment-heading"><div><span className="eyebrow">ATENDIMENTO</span><h3>Fila de interessados</h3></div><span>{home.interessados?.length || 0} pessoa(s)</span></div>
      {home.interessados?.length ? <div className="interest-list">{home.interessados.map((item, index) => <article key={item.id}><span className="interest-rank">{String(index + 1).padStart(2, "0")}</span><div><b>{item.cliente.nome}</b><small>{item.cliente.telefone || item.cliente.email || "Sem contato cadastrado"}{item.observacoes ? ` · ${item.observacoes}` : ""}</small></div><label>Prioridade<select aria-label={`Prioridade de ${item.cliente.nome}`} disabled={!canManage} value={item.prioridade} onChange={event => update(`/interessados/${item.id}`, "PATCH", { prioridade: Number(event.target.value) })}>{[5, 4, 3, 2, 1, 0].map(value => <option key={value} value={value}>{value === 0 ? "Normal" : `${value} · ${value >= 4 ? "Alta" : value >= 2 ? "Média" : "Baixa"}`}</option>)}</select></label>{canManage && <button aria-label={`Remover ${item.cliente.nome} da fila`} onClick={() => onAskConfirmation({ title: "Remover interessado", description: `${item.cliente.nome} será removido da fila de interessados deste imóvel.`, confirmLabel: "Remover da fila", onConfirm: () => onMutate(home.id, `/interessados/${item.id}`, "DELETE") })}>×</button>}</article>)}</div> : <p className="attachment-empty">Nenhum interessado aguardando atendimento neste imóvel.</p>}
      {canManage && clients.length > 0 && <form className="interest-add-form" onSubmit={async event => { event.preventDefault(); if (await update("/interessados", "POST", { ...interestForm, clienteId: Number(interestForm.clienteId), prioridade: Number(interestForm.prioridade) })) setInterestForm({ clienteId: "", prioridade: "3", observacoes: "" }); }}><select required value={interestForm.clienteId} onChange={event => setInterestForm({ ...interestForm, clienteId: event.target.value })}><option value="">Adicionar pessoa interessada</option>{clients.filter(client => !home.interessados?.some(item => item.clienteId === client.id)).map(client => <option key={client.id} value={client.id}>{client.nome}</option>)}</select><select aria-label="Prioridade inicial" value={interestForm.prioridade} onChange={event => setInterestForm({ ...interestForm, prioridade: event.target.value })}>{[5, 4, 3, 2, 1, 0].map(value => <option value={value} key={value}>{value === 0 ? "Normal" : `Prioridade ${value}`}</option>)}</select><input value={interestForm.observacoes} onChange={event => setInterestForm({ ...interestForm, observacoes: event.target.value })} placeholder="Observação opcional"/><button className="secondary">＋ Incluir interessado</button></form>}
    </section>
    {error && <p className="form-error property-operation-error">{error}</p>}
  </div>;
}
function SheetItem({ label, value }) { return <div className="sheet-item"><small>{label}</small><b>{value}</b></div>; }

function InspectionPanel({ inspections, homes, canManage, onCreate }) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ imovelId: "", tipo: "ENTRADA", descricao: "", realizadaEm: new Date().toISOString().slice(0, 10) });
  return <section className="inspection-panel">
    <div className="inspection-heading"><div><span className="eyebrow">CONSERVAÇÃO E OCORRÊNCIAS</span><h2>Vistorias e manutenção</h2><p>Histórico de entrada, saída, manutenção e ocorrências por imóvel.</p></div>{canManage && <button className="secondary" type="button" onClick={() => setOpen(value => !value)}>{open ? "Fechar" : "＋ Registrar"}</button>}</div>
    {open && <form className="inspection-form" onSubmit={async event => { event.preventDefault(); setSaving(true); const saved = await onCreate({ ...form, imovelId: Number(form.imovelId), realizadaEm: new Date(`${form.realizadaEm}T12:00:00`).toISOString() }); setSaving(false); if (saved) { setOpen(false); setForm(current => ({ ...current, descricao: "" })); } }}>
      <label>Imóvel<select required value={form.imovelId} onChange={event => setForm({ ...form, imovelId: event.target.value })}><option value="">Selecione</option>{homes.map(home => <option key={home.id} value={home.id}>{home.codigo} · {home.titulo}</option>)}</select></label>
      <label>Tipo<select value={form.tipo} onChange={event => setForm({ ...form, tipo: event.target.value })}><option value="ENTRADA">Entrada</option><option value="SAIDA">Saída</option><option value="MANUTENCAO">Manutenção</option><option value="OCORRENCIA">Ocorrência</option></select></label>
      <label>Data<input type="date" required value={form.realizadaEm} onChange={event => setForm({ ...form, realizadaEm: event.target.value })}/></label>
      <label className="inspection-description">Descrição<textarea required minLength={5} rows={2} value={form.descricao} onChange={event => setForm({ ...form, descricao: event.target.value })} placeholder="Descreva o estado do imóvel, reparo ou ocorrência"/></label>
      <button className="primary" disabled={saving || !homes.length}>{saving ? "Salvando…" : "Salvar vistoria"}</button>
    </form>}
    {inspections.length ? <div className="inspection-list">{inspections.map(item => <article key={item.id}><span className={`inspection-type inspection-${item.tipo.toLowerCase()}`}>{({ ENTRADA: "Entrada", SAIDA: "Saída", MANUTENCAO: "Manutenção", OCORRENCIA: "Ocorrência" })[item.tipo] || item.tipo}</span><div><b>{item.imovel?.titulo || "Imóvel"}</b><p>{item.descricao}</p><small>{item.imovel?.codigo} · {new Date(item.realizadaEm).toLocaleDateString("pt-BR")}</small></div></article>)}</div> : <div className="inspection-empty">Nenhuma vistoria ou ocorrência registrada.</div>}
  </section>;
}

function FinancialSheet({ contracts, homes, clients, canManage, onCreateContract, onCreatePayment, onSetPaymentStatus, onApplyAdjustment }) {
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [receipt, setReceipt] = useState(null);
  const [receiving, setReceiving] = useState(null);
  const [expandedContract, setExpandedContract] = useState(null);
  const today = new Date();
  const currentReference = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
  const [form, setForm] = useState({ imovelId: "", inquilinoId: "", proprietarioId: "", fiadorId: "", inicio: currentReference + "-01", fim: `${today.getFullYear() + 1}-${String(today.getMonth() + 1).padStart(2, "0")}-01`, diaVencimento: "10", valorAluguel: "", indiceReajuste: "IPCA" });
  const monthlyRent = contracts.reduce((total, contract) => total + Number(contract.valorAluguel), 0);
  const paymentRows = contracts.flatMap(contract => contract.pagamentos.map(payment => ({ ...payment, contract })));
  const received = paymentRows.filter(payment => payment.status === "PAGO").reduce((total, payment) => total + Number(payment.valor), 0);
  const paidCommission = received * 0.1;
  const paidOwnerTransfer = received - paidCommission;
  const pending = paymentRows.filter(payment => payment.status !== "PAGO").reduce((total, payment) => total + Number(payment.valor), 0);
  return <>
    <div className="finance-section-head"><div><span className="eyebrow">CARTEIRA DE LOCAÇÕES</span><h2>Contratos e repasses</h2><p>Aluguel mensal, comissão de 10% da Perugine e repasse líquido de 90% ao proprietário.</p></div>{canManage && <button className="primary" onClick={() => setCreating(value => !value)}>{creating ? "Fechar formulário" : "＋ Nova locação"}</button>}</div>
    {creating && <form className="finance-form" onSubmit={async event => { event.preventDefault(); setSaving(true); const saved = await onCreateContract({ ...form, imovelId: Number(form.imovelId), inquilinoId: Number(form.inquilinoId), proprietarioId: Number(form.proprietarioId), fiadorId: form.fiadorId ? Number(form.fiadorId) : null, diaVencimento: Number(form.diaVencimento) }); setSaving(false); if (saved) setCreating(false); }}>
      <h3>Dados da locação</h3><p>Selecione os cadastros existentes para vincular o contrato ao imóvel, inquilino e proprietário.</p>
      <div className="finance-form-grid"><label>Imóvel<select required value={form.imovelId} onChange={event => setForm({ ...form, imovelId: event.target.value, valorAluguel: homes.find(home => String(home.id) === event.target.value)?.valor || form.valorAluguel })}><option value="">Selecione</option>{homes.filter(home => ["DISPONIVEL", "RESERVADO"].includes(home.status)).map(home => <option value={home.id} key={home.id}>{home.codigo} · {home.titulo}</option>)}</select></label>
        <label>Inquilino<select required value={form.inquilinoId} onChange={event => setForm({ ...form, inquilinoId: event.target.value })}><option value="">Selecione</option>{clients.filter(client => client.tipo === "INQUILINO").map(client => <option value={client.id} key={client.id}>{client.nome}</option>)}</select></label>
        <label>Proprietário<select required value={form.proprietarioId} onChange={event => setForm({ ...form, proprietarioId: event.target.value })}><option value="">Selecione</option>{clients.filter(client => client.tipo === "PROPRIETARIO").map(client => <option value={client.id} key={client.id}>{client.nome}</option>)}</select></label>
        <label>Fiador (opcional)<select value={form.fiadorId} onChange={event => setForm({ ...form, fiadorId: event.target.value })}><option value="">Sem fiador</option>{clients.filter(client => client.tipo === "FIADOR").map(client => <option value={client.id} key={client.id}>{client.nome}</option>)}</select></label>
        <label>Aluguel mensal (R$)<input required type="number" min="0.01" step="0.01" value={form.valorAluguel} onChange={event => setForm({ ...form, valorAluguel: event.target.value })}/></label>
        <label>Dia de vencimento<input required type="number" min="1" max="31" value={form.diaVencimento} onChange={event => setForm({ ...form, diaVencimento: event.target.value })}/></label>
        <label>Início do contrato<input required type="date" value={form.inicio} onChange={event => setForm({ ...form, inicio: event.target.value })}/></label>
        <label>Fim do contrato<input required type="date" value={form.fim} onChange={event => setForm({ ...form, fim: event.target.value })}/></label>
        <label>Índice de reajuste<select value={form.indiceReajuste} onChange={event => setForm({ ...form, indiceReajuste: event.target.value })}><option value="">Definir depois</option><option value="IPCA">IPCA</option><option value="IGP-M">IGP-M</option></select></label></div>
      {(!homes.some(home => ["DISPONIVEL", "RESERVADO"].includes(home.status)) || !clients.some(client => client.tipo === "INQUILINO") || !clients.some(client => client.tipo === "PROPRIETARIO")) && <small className="finance-form-help">Cadastre um imóvel disponível, um cliente como inquilino e outro como proprietário antes de criar a locação.</small>}
      <div className="form-actions"><button type="button" className="secondary" onClick={() => setCreating(false)}>Cancelar</button><button className="primary" disabled={saving || !homes.some(home => ["DISPONIVEL", "RESERVADO"].includes(home.status)) || !clients.some(client => client.tipo === "INQUILINO") || !clients.some(client => client.tipo === "PROPRIETARIO")}>{saving ? "Salvando…" : "Criar contrato"}</button></div>
    </form>}
    {contracts.length ? <div className="finance-portfolio-wrap"><table className="finance-portfolio"><thead><tr><th>IMÓVEL / CONTRATO</th><th>INQUILINO</th><th>PROPRIETÁRIO</th><th>ALUGUEL</th><th>COMISSÃO · 10%</th><th>REPASSE · 90%</th><th>VENCIMENTO</th><th></th></tr></thead><tbody>{contracts.map(contract => <Fragment key={contract.id}><tr className={expandedContract === contract.id ? "portfolio-expanded" : ""}><td><b>{contract.imovel.codigo} · {contract.imovel.titulo}</b><small>{contract.numero} · {contract.imovel.endereco}, {contract.imovel.cidade}</small></td><td>{contract.inquilino.nome}</td><td>{contract.proprietario.nome}</td><td className="portfolio-money">{brl(contract.valorAluguel)}</td><td className="portfolio-commission">{brl(Number(contract.valorAluguel) * .1)}</td><td className="portfolio-transfer">{brl(Number(contract.valorAluguel) * .9)}</td><td>Dia {contract.diaVencimento}<small>até {new Date(contract.fim).toLocaleDateString("pt-BR")}</small></td><td><button className="portfolio-open" type="button" onClick={() => setExpandedContract(current => current === contract.id ? null : contract.id)}>{expandedContract === contract.id ? "Fechar" : "Extrato"}</button></td></tr>{expandedContract === contract.id && <tr className="portfolio-detail-row"><td colSpan="8">{canManage && <AdjustmentForm contract={contract} onApply={onApplyAdjustment}/>}<FinancialStatement contract={contract} currentReference={currentReference} canManage={canManage} onCreatePayment={onCreatePayment} onReceiptPayment={payment => setReceiving({ contract, payment })} onReceipt={payment => setReceipt({ contract, payment })}/></td></tr>}</Fragment>)}</tbody><tfoot><tr><th colSpan="3">TOTAL MENSAL · {contracts.length} LOCAÇÃO(ÕES)</th><th>{brl(monthlyRent)}</th><th>{brl(monthlyRent * .1)}</th><th>{brl(monthlyRent * .9)}</th><th colSpan="2"></th></tr></tfoot></table></div> : <Empty title="Nenhuma locação cadastrada" text="Quando houver contratos de aluguel ativos, os aluguéis, comissões e repasses aparecerão nesta tabela."/>}
    <div className="finance-cash-summary"><div><span>RECEBIDO EM PAGAMENTOS</span><b>{brl(received)}</b><small>Comissão {brl(paidCommission)} · Repasse {brl(paidOwnerTransfer)}</small></div><div><span>COBRANÇAS LANÇADAS E NÃO RECEBIDAS</span><b>{brl(pending)}</b><small>{paymentRows.filter(payment => payment.status !== "PAGO").length} cobrança(s) aguardando baixa</small></div></div>
    {receiving && <PaymentReceiptForm contract={receiving.contract} payment={receiving.payment} onClose={() => setReceiving(null)} onSave={async details => { const saved = await onSetPaymentStatus(receiving.payment.id, "PAGO", details); if (saved?.error) return saved; setReceiving(null); setReceipt({ contract: receiving.contract, payment: saved }); return true; }}/>}
    {receipt && <ReceiptModal contract={receipt.contract} payment={receipt.payment} onClose={() => setReceipt(null)}/>}
  </>;
}

function AdjustmentForm({ contract, onApply }) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [indice, setIndice] = useState(contract.indiceReajuste === "IGP-M" ? "IGP-M" : "IPCA");
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!open) return;
    let active = true;
    setLoading(true); setError(""); setPreview(null);
    apiFetch(`${API}/contratos/${contract.id}/reajustes/previa?indice=${encodeURIComponent(indice)}`).then(async response => {
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Não foi possível calcular o índice.");
      if (active) setPreview(result);
    }).catch(reason => { if (active) setError(reason.message || "Não foi possível consultar o índice."); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [open, indice, contract.id]);
  return <div className="adjustment-box">
    <div className="adjustment-history"><span><b>Reajuste anual por índice</b><small>Último aplicado: {contract.aditamentos?.[0] ? new Date(contract.aditamentos[0].aplicadoEm).toLocaleDateString("pt-BR") : new Date(contract.inicio).toLocaleDateString("pt-BR")}</small></span>{contract.aditamentos?.length ? <div>{contract.aditamentos.map(item => <small key={item.id}>{new Date(item.aplicadoEm).toLocaleDateString("pt-BR")} · {item.indice} {item.percentual ? `(${Number(item.percentual).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 4 })}%)` : ""} · {brl(item.valorAnterior)} → <b>{brl(item.valorNovo)}</b></small>)}</div> : <small>Nenhum reajuste registrado.</small>}</div>
    <button type="button" className="adjustment-toggle" onClick={() => setOpen(value => !value)}>{open ? "Fechar cálculo" : "↻ Calcular reajuste anual"}</button>
    {open && <div className="adjustment-live"><label>Índice previsto no contrato<select value={indice} onChange={event => setIndice(event.target.value)}><option>IPCA</option><option>IGP-M</option></select></label>{loading && <p>Consultando a série oficial e calculando os 12 meses…</p>}{error && <p className="adjustment-error">{error}</p>}{preview && !preview.eligible && <p className="adjustment-next-date">Este contrato ainda não completou um ano desde o último reajuste. Próxima data: <b>{new Date(preview.nextDate).toLocaleDateString("pt-BR")}</b>.</p>}{preview?.eligible && <><div className="adjustment-result"><div><small>ACUMULADO · {preview.indice}</small><b>{Number(preview.percentual).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 4 })}%</b><span>{new Date(preview.periodoInicio).toLocaleDateString("pt-BR", { month: "short", year: "numeric" })} a {new Date(preview.periodoFim).toLocaleDateString("pt-BR", { month: "short", year: "numeric" })}</span></div><i>→</i><div><small>NOVO ALUGUEL MENSAL</small><b>{brl(preview.valorNovo)}</b><span>Antes: {brl(preview.valorAtual)}</span></div></div><details className="adjustment-months"><summary>Ver composição dos 12 meses</summary><div>{preview.meses.map(month => <span key={month.referencia}>{month.referencia}<b>{Number(month.variacao).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}%</b></span>)}</div></details><p className="adjustment-source-note">Fonte: séries mensais SGS do Banco Central do Brasil, compostas mês a mês. Confirme a regra e a data de aplicação previstas no contrato antes de efetivar.</p><button type="button" className="primary" disabled={saving} onClick={async () => { setSaving(true); const saved = await onApply(contract.id, { indice }); setSaving(false); if (saved) { setOpen(false); setPreview(null); } }}>{saving ? "Aplicando…" : "Confirmar reajuste e aditamento"}</button></>}</div>}
  </div>;
}

function FinancialStatement({ contract, currentReference, canManage, onCreatePayment, onReceiptPayment, onReceipt }) {
  const start = new Date(contract.inicio); const finish = new Date(contract.fim); const now = new Date();
  const firstMonth = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1));
  const currentMonth = new Date(Date.UTC(now.getFullYear(), now.getMonth(), 1));
  const contractEndMonth = new Date(Date.UTC(finish.getUTCFullYear(), finish.getUTCMonth(), 1));
  const lastMonth = contractEndMonth < currentMonth ? contractEndMonth : currentMonth;
  const currentIsWithinContract = currentMonth >= firstMonth && currentMonth <= contractEndMonth;
  const byReference = new Map(contract.pagamentos.map(payment => [payment.referencia, payment]));
  const references = new Set(contract.pagamentos.map(payment => payment.referencia));
  for (const cursor = new Date(firstMonth); cursor <= lastMonth; cursor.setUTCMonth(cursor.getUTCMonth() + 1)) references.add(`${cursor.getUTCFullYear()}-${String(cursor.getUTCMonth() + 1).padStart(2, "0")}`);
  const ordered = [...references].filter(ref => /^\d{4}-\d{2}$/.test(ref)).sort();
  let balance = 0;
  const rows = ordered.map(reference => {
    const payment = byReference.get(reference);
    let debit = Number(contract.valorAluguel);
    for (const adjustment of contract.aditamentos || []) {
      const effectiveReference = `${new Date(adjustment.aplicadoEm).getUTCFullYear()}-${String(new Date(adjustment.aplicadoEm).getUTCMonth() + 1).padStart(2, "0")}`;
      if (reference < effectiveReference) debit = Number(adjustment.valorAnterior);
    }
    const credit = payment?.status === "PAGO" ? Number(payment.valor) : 0;
    balance += debit - credit;
    return { reference, payment, debit, credit, balance };
  });
  const currentPayment = byReference.get(currentReference);
  return <section className="finance-ledger-section">
    <div className="ledger-heading"><span><b>Extrato da locação</b><small>Uma linha por mês do contrato · valores em reais</small></span><strong>Saldo atual <b>{brl(balance)}</b></strong></div>
    <div className="ledger-scroll"><table className="finance-ledger"><thead><tr><th>Competência / vencimento</th><th>Discriminação</th><th>Débito</th><th>Crédito</th><th>Saldo</th><th>Recibo / situação</th></tr></thead><tbody>{rows.map(row => {
      const due = new Date(Number(row.reference.slice(0, 4)), Number(row.reference.slice(5, 7)) - 1, Math.min(contract.diaVencimento, new Date(Number(row.reference.slice(0, 4)), Number(row.reference.slice(5, 7)), 0).getDate()), 12);
      const state = row.payment?.status === "PAGO" ? "Pago" : row.payment?.status === "ATRASADO" || due < now ? "Em aberto" : "A vencer";
      return <tr key={row.reference}><td><b>{new Date(`${row.reference}-02T12:00:00`).toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}</b><small>Venc. {due.toLocaleDateString("pt-BR")}</small></td><td>{row.payment ? `Aluguel · ${row.reference}` : "Aluguel mensal"}</td><td>{brl(row.debit)}</td><td className={row.credit ? "ledger-credit" : ""}>{row.credit ? brl(row.credit) : "—"}</td><td className={row.balance > 0 ? "ledger-balance" : "ledger-settled"}>{brl(row.balance)}</td><td>{row.payment?.status === "PAGO" ? <div className="ledger-actions"><span className="ledger-paid">Pago · {row.payment.formaPagamento || "sem forma"}</span><button type="button" onClick={() => onReceipt(row.payment)}>Recibo</button></div> : <div className="ledger-actions"><span className="ledger-open">{state}</span>{canManage && (row.payment ? <button type="button" onClick={() => onReceiptPayment(row.payment)}>Registrar recebimento</button> : row.reference <= currentReference && <button type="button" onClick={() => onCreatePayment(contract.id, row.reference)}>Lançar cobrança</button>)}</div>}</td></tr>;
    })}</tbody></table></div>
    {canManage && currentIsWithinContract && !currentPayment && !rows.some(row => row.reference === currentReference) && <button type="button" className="finance-payment-add" onClick={() => onCreatePayment(contract.id, currentReference)}>＋ Lançar cobrança de {currentReference}</button>}
    <div className="ledger-footnote"><span>Comissão Perugine (10%) sobre valores recebidos</span><b>{brl(contract.pagamentos.filter(payment => payment.status === "PAGO").reduce((sum, payment) => sum + Number(payment.valor) * .1, 0))}</b><span>Repasse líquido ao proprietário (90%)</span><b>{brl(contract.pagamentos.filter(payment => payment.status === "PAGO").reduce((sum, payment) => sum + Number(payment.valor) * .9, 0))}</b></div>
  </section>;
}

function PaymentReceiptForm({ contract, payment, onClose, onSave }) {
  const amount = Number(payment.valor);
  const [formaPagamento, setFormaPagamento] = useState("PIX");
  const [valorRecebido, setValorRecebido] = useState(String(amount.toFixed(2)));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const received = Number(valorRecebido) || 0;
  const change = Math.max(0, Math.round((received - amount + Number.EPSILON) * 100) / 100);
  return <div className="receipt-overlay"><section className="receipt-paper payment-confirm-paper"><div className="modal-title"><div><span className="eyebrow">CAIXA · {payment.referencia}</span><h2>Registrar recebimento</h2></div><button type="button" aria-label="Fechar" onClick={onClose}>×</button></div><p>Confirme o recebimento de <b>{brl(amount)}</b> do inquilino <b>{contract.inquilino.nome}</b>.</p><form className="payment-confirm-form" onSubmit={async event => { event.preventDefault(); setError(""); setSaving(true); const result = await onSave({ formaPagamento, valorRecebido: received }); setSaving(false); if (result?.error) setError(result.error); }}><label>Forma de pagamento<select value={formaPagamento} onChange={event => { setFormaPagamento(event.target.value); setValorRecebido(amount.toFixed(2)); }}><option value="PIX">PIX</option><option value="DINHEIRO">Dinheiro</option><option value="TRANSFERENCIA">Transferência</option><option value="BOLETO">Boleto</option></select></label><label>Valor recebido (R$)<input type="number" inputMode="decimal" min={formaPagamento === "DINHEIRO" ? amount : amount} step="0.01" required value={valorRecebido} onChange={event => setValorRecebido(event.target.value)}/></label><div className="payment-confirm-math"><span>Valor da cobrança<b>{brl(amount)}</b></span><span>Troco<b>{formaPagamento === "DINHEIRO" ? brl(change) : brl(0)}</b></span></div>{formaPagamento === "DINHEIRO" && received < amount && <small className="adjustment-error">O valor recebido precisa cobrir a cobrança.</small>}{formaPagamento !== "DINHEIRO" && Math.abs(received - amount) > .01 && <small className="adjustment-error">Para esta forma de pagamento, informe o valor exato da cobrança.</small>}{error && <small className="adjustment-error">{error}</small>}<div className="receipt-buttons"><button type="button" className="secondary" onClick={onClose}>Cancelar</button><button className="primary" disabled={saving || received < amount || (formaPagamento !== "DINHEIRO" && Math.abs(received - amount) > .01)}>{saving ? "Registrando…" : "Confirmar recebimento"}</button></div></form></section></div>;
}

function ReceiptModal({ contract, payment, onClose }) {
  const amount = Number(payment.valor);
  const receivedAt = payment.pagoEm ? new Date(payment.pagoEm) : new Date();
  const [year, month] = payment.referencia.split("-").map(Number);
  const competence = new Date(year, (month || 1) - 1, 1, 12).toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
  const amountInWords = currencyInWords(amount);
  const city = contract.imovel.cidade || "Andirá";
  const address = contract.imovel.endereco || "endereço não informado";
  const documentLabel = documentText[contract.inquilino.tipoDocumento] || "Documento";
  const tenantDocument = contract.inquilino.documento || "________________________";
  return <div className="receipt-overlay"><section className="receipt-paper official-receipt">
    <header className="official-receipt-heading"><h2>RECIBO</h2><b>{brl(amount)}</b></header>
    <p>RECEBI DE <b>{contract.inquilino.nome.toLocaleUpperCase("pt-BR")}</b>, {documentLabel.toLocaleUpperCase("pt-BR")}: <b>{tenantDocument}</b>, A QUANTIA ACIMA DE <b>{amountInWords.toLocaleUpperCase("pt-BR")}</b>, REFERENTE AO ALUGUEL DO MÊS DE <b>{competence.toLocaleUpperCase("pt-BR")}</b>, DO IMÓVEL SITO A <b>{address.toLocaleUpperCase("pt-BR")}</b>, NA CIDADE DE <b>{city.toLocaleUpperCase("pt-BR")}</b>, ESTADO DO PARANÁ.</p>
    <p className="official-receipt-truth">POR SER VERDADE,</p>
    <p className="official-receipt-signoff">FIRMO O PRESENTE,</p>
    <p className="official-receipt-place">{city.toLocaleUpperCase("pt-BR")}, {receivedAt.toLocaleDateString("pt-BR", { day: "numeric", month: "long", year: "numeric" }).toLocaleUpperCase("pt-BR")}</p>
    <footer className="official-receipt-footer"><div className="official-receipt-signature"></div><div className="official-receipt-stamp"><b>PERUGINE - CORRETORA DE IMÓVEIS</b><b>CRECI-PR Nº 13.239 · CPF: 239.746.569-87</b><b>RUA BANDEIRANTES, 146</b><b>FONE: (43) 3538-2072 / 99624-8484</b><b>ANDIRÁ · PARANÁ · CEP 86.380-000</b></div></footer>
    <div className="receipt-buttons"><button className="secondary" onClick={onClose}>Fechar</button><button className="primary" onClick={() => window.print()}>Imprimir / Salvar em PDF</button></div>
  </section></div>;
}

function currencyInWords(value) {
  const units = ["zero", "um", "dois", "três", "quatro", "cinco", "seis", "sete", "oito", "nove"];
  const teens = ["dez", "onze", "doze", "treze", "quatorze", "quinze", "dezesseis", "dezessete", "dezoito", "dezenove"];
  const tens = ["", "", "vinte", "trinta", "quarenta", "cinquenta", "sessenta", "setenta", "oitenta", "noventa"];
  const hundreds = ["", "cento", "duzentos", "trezentos", "quatrocentos", "quinhentos", "seiscentos", "setecentos", "oitocentos", "novecentos"];
  const underThousand = n => {
    if (!n) return "";
    if (n === 100) return "cem";
    const parts = [];
    if (n >= 100) { parts.push(hundreds[Math.floor(n / 100)]); n %= 100; }
    if (n >= 10 && n < 20) parts.push(teens[n - 10]);
    else {
      if (n >= 20) { parts.push(tens[Math.floor(n / 10)]); n %= 10; }
      if (n > 0) parts.push(units[n]);
    }
    return parts.join(" e ");
  };
  const whole = Math.floor(Math.max(0, Number(value) || 0));
  const cents = Math.round((Math.max(0, Number(value) || 0) - whole) * 100);
  const groups = [];
  let remainder = whole;
  const millions = Math.floor(remainder / 1_000_000); remainder %= 1_000_000;
  const thousands = Math.floor(remainder / 1000); remainder %= 1000;
  if (millions) groups.push(`${underThousand(millions)} ${millions === 1 ? "milhão" : "milhões"}`);
  if (thousands) groups.push(thousands === 1 ? "mil" : `${underThousand(thousands)} mil`);
  if (remainder) groups.push(underThousand(remainder));
  let result = `${groups.join(" e ") || "zero"} ${whole === 1 ? "real" : "reais"}`;
  if (cents) result += ` e ${underThousand(cents)} ${cents === 1 ? "centavo" : "centavos"}`;
  return result;
}

function Modal({ title, close, children, wide }) { return <div className="overlay" onMouseDown={close}><section className={`modal ${wide ? "modal-wide" : ""}`} onMouseDown={e => e.stopPropagation()}><div className="modal-title"><div><span className="eyebrow">PERUGINE · GESTÃO</span><h2>{title}</h2></div><button aria-label="Fechar" onClick={close}>×</button></div>{children}</section></div>; }

function ClientForm({ initial, onSave, onCancel, busy }) {
  const [form, setForm] = useState({ nome: initial?.nome || "", tipo: initial?.tipo || "INTERESSADO", tipoDocumento: initial?.tipoDocumento || "CPF", documento: initial?.documento || "", telefone: initial?.telefone || "", email: initial?.email || "" });
  const [files, setFiles] = useState([]); const [error, setError] = useState("");
  const change = e => setForm({ ...form, [e.target.name]: e.target.value });
  const addFiles = e => { setFiles(current => [...current, ...Array.from(e.target.files || []).map(file => ({ file, categoria: "DOCUMENTO_IDENTIDADE", id: crypto.randomUUID() }))]); e.target.value = ""; };
  const updateCategory = (id, categoria) => setFiles(current => current.map(item => item.id === id ? { ...item, categoria } : item));
  return <form className="form" onSubmit={async e => { e.preventDefault(); setError(""); try { await onSave({ data: form, files }); } catch (x) { setError(x.message); } }}>
    <div className="form-section-heading"><span className="form-step">01</span><div><b>Dados do cliente</b><small>Informações de identificação e contato.</small></div></div>
    <label>Nome completo<input name="nome" required value={form.nome} onChange={change} placeholder="Nome ou razão social"/></label>
    <div className="form-row"><label>Perfil<select name="tipo" value={form.tipo} onChange={change}>{Object.entries(roleText).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label>Tipo de documento<select name="tipoDocumento" value={form.tipoDocumento} onChange={change}>{Object.entries(documentText).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label></div>
    <div className="form-row"><label>{documentText[form.tipoDocumento] || "Documento"}<input name="documento" value={form.documento} onChange={change} placeholder={form.tipoDocumento === "CPF" ? "000.000.000-00" : form.tipoDocumento === "CNPJ" ? "00.000.000/0000-00" : "Número do documento"}/></label><label>Telefone<input name="telefone" value={form.telefone} onChange={change} placeholder="(00) 00000-0000"/></label></div>
    <label>E-mail<input name="email" type="email" value={form.email} onChange={change} placeholder="nome@email.com"/></label>
    <div className="form-section-heading attachment-form-heading"><span className="form-step">02</span><div><b>Documentos digitalizados</b><small>Anexe identidade, comprovantes e outros arquivos do cliente ou fiador.</small></div></div>
    <label className="upload-drop"><input type="file" accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp" multiple onChange={addFiles}/><span className="upload-icon">↑</span><b>Selecionar arquivos</b><small>PDF ou imagem · até 15 MB por arquivo</small></label>
    {!!files.length && <div className="pending-files">{files.map(item => <div className="pending-file" key={item.id}><span className="file-icon">{item.file.type === "application/pdf" ? "PDF" : "IMG"}</span><span className="pending-file-name">{item.file.name}</span><select aria-label={`Categoria de ${item.file.name}`} value={item.categoria} onChange={e => updateCategory(item.id, e.target.value)}>{attachmentTypes.map(type => <option key={type} value={type}>{attachmentLabels[type]}</option>)}</select><button type="button" aria-label={`Remover ${item.file.name}`} onClick={() => setFiles(current => current.filter(file => file.id !== item.id))}>×</button></div>)}</div>}
    <Actions error={error} cancel={onCancel} label={busy ? "Salvando…" : initial ? "Salvar alterações" : "Salvar cliente"} disabled={busy}/>
  </form>;
}

function HomeForm({ initial, onSave, onCancel, busy }) {
  const [form, setForm] = useState({ codigo: initial?.codigo || "", titulo: initial?.titulo || "", endereco: initial?.endereco || "", cidade: initial?.cidade || "Andirá", tipo: initial?.tipo || "Casa", quartos: initial?.quartos ?? 0, valor: initial?.valor || "", status: initial?.status || "DISPONIVEL", observacoes: initial?.observacoes || "" });
  const [photos, setPhotos] = useState([]); const [error, setError] = useState("");
  const change = e => setForm({ ...form, [e.target.name]: e.target.value });
  const addPhotos = e => { setPhotos(current => [...current, ...Array.from(e.target.files || [])]); e.target.value = ""; };
  return <form className="form" onSubmit={async e => { e.preventDefault(); setError(""); try { await onSave({ data: form, files: photos.map(file => ({ file })) }); } catch (x) { setError(x.message); } }}>
    <div className="form-section-heading"><span className="form-step">01</span><div><b>Informações do imóvel</b><small>Cadastre os detalhes que ajudam a encontrar o imóvel ideal.</small></div></div>
    <div className="form-row"><label>Código<input name="codigo" required value={form.codigo} onChange={change} placeholder="PER-002"/></label><label>Tipo de imóvel<select name="tipo" value={form.tipo} onChange={change}><option>Casa</option><option>Apartamento</option><option>Terreno</option><option>Comercial</option><option>Rural</option></select></label></div>
    <label>Nome do imóvel<input name="titulo" required value={form.titulo} onChange={change} placeholder="Ex.: Casa com quintal"/></label>
    <label>Endereço<input name="endereco" required value={form.endereco} onChange={change} placeholder="Rua, número e bairro"/></label>
    <div className="form-row"><label>Cidade<input name="cidade" value={form.cidade} onChange={change}/></label><label>Quartos<input name="quartos" type="number" min="0" value={form.quartos} onChange={change}/></label></div>
    <div className="form-row"><label>Valor (R$)<input name="valor" type="number" min="0.01" step="0.01" required value={form.valor} onChange={change} placeholder="0,00"/></label><label>Situação<select name="status" value={form.status} onChange={change}><option value="DISPONIVEL">Disponível</option><option value="RESERVADO">Reservado</option><option value="ALUGADO">Alugado</option><option value="VENDIDO">Vendido</option></select></label></div>
    <label>Observações<textarea name="observacoes" rows="3" value={form.observacoes} onChange={change} placeholder="Detalhes e características do imóvel"/></label>
    <div className="form-section-heading attachment-form-heading"><span className="form-step">02</span><div><b>Fotos do imóvel</b><small>Adicione quantas imagens quiser para mostrar cada detalhe.</small></div></div>
    <label className="upload-drop"><input type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={addPhotos}/><span className="upload-icon">＋</span><b>Escolher fotos</b><small>JPG, PNG ou WebP · até 12 MB por foto</small></label>
    {!!photos.length && <div className="photo-preview-grid">{photos.map((file, index) => <div className="photo-preview" key={`${file.name}-${index}`}><img src={URL.createObjectURL(file)} alt={file.name}/><button type="button" aria-label={`Remover ${file.name}`} onClick={() => setPhotos(current => current.filter((_, i) => i !== index))}>×</button><small>{file.name}</small></div>)}</div>}
    {initial?.fotos?.length > 0 && <p className="existing-photos-hint">Este imóvel já tem {initial.fotos.length} foto(s) salvas. As novas serão adicionadas à galeria.</p>}
    <Actions error={error} cancel={onCancel} label={busy ? "Salvando…" : initial ? "Salvar alterações" : "Cadastrar imóvel"} disabled={busy}/>
  </form>;
}

function VisitForm({ homes, clients, onSave, onCancel, busy }) {
  const [form, setForm] = useState({ imovelId: "", clienteId: "", inicio: "", corretor: "", observacoes: "" }); const [error, setError] = useState("");
  const change = e => setForm({ ...form, [e.target.name]: e.target.value });
  return <form className="form" onSubmit={async e => { e.preventDefault(); setError(""); try { await onSave({ ...form, imovelId: Number(form.imovelId), clienteId: Number(form.clienteId), inicio: new Date(form.inicio).toISOString() }); } catch (x) { setError(x.message); } }}>
    <div className="form-section-heading"><span className="form-step">01</span><div><b>Detalhes da visita</b><small>Escolha um imóvel, um cliente e o melhor horário.</small></div></div>
    <label>Imóvel<select required name="imovelId" value={form.imovelId} onChange={change}><option value="">Selecione um imóvel</option>{homes.map(home => <option value={home.id} key={home.id}>{home.codigo} · {home.titulo}</option>)}</select></label>
    <label>Cliente interessado<select required name="clienteId" value={form.clienteId} onChange={change}><option value="">Selecione um cliente</option>{clients.map(client => <option value={client.id} key={client.id}>{client.nome}</option>)}</select></label>
    <div className="form-row"><label>Data e hora<input required type="datetime-local" name="inicio" min={new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16)} value={form.inicio} onChange={change}/></label><label>Corretor(a)<input name="corretor" value={form.corretor} onChange={change} placeholder="Nome do responsável"/></label></div>
    <label>Observações<textarea rows="3" name="observacoes" value={form.observacoes} onChange={change} placeholder="Ponto de encontro, preferências, etc."/></label>
    {homes.length === 0 && <p className="form-error">Cadastre um imóvel disponível ou reservado antes de agendar.</p>}
    {clients.length === 0 && <p className="form-error">Cadastre um cliente antes de agendar.</p>}
    <Actions error={error} cancel={onCancel} label={busy ? "Agendando…" : "Confirmar visita"} disabled={busy || homes.length === 0 || clients.length === 0}/>
  </form>;
}

function Actions({ error, cancel, label, disabled = false }) { return <><p className="form-error">{error}</p><div className="form-actions"><button type="button" className="secondary" onClick={cancel}>Cancelar</button><button className="primary" disabled={disabled}>{label}</button></div></>; }
