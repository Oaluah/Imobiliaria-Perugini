import { useEffect, useMemo, useState } from "react";
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
  } catch { tab?.close(); window.alert("Não foi possível abrir este arquivo."); }
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
  const [dialog, setDialog] = useState("");
  const [editing, setEditing] = useState(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("TODOS");
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

  const refresh = async () => {
    try {
      const [c, h, v, f, i] = await Promise.all([
        can(currentUser, "clients.view") ? apiFetch(`${API}/clientes`) : Promise.resolve(null),
        can(currentUser, "properties.view") ? apiFetch(`${API}/imoveis`) : Promise.resolve(null),
        can(currentUser, "visits.view") ? apiFetch(`${API}/visitas`) : Promise.resolve(null),
        can(currentUser, "finance.view") ? apiFetch(`${API}/financeiro`) : Promise.resolve(null),
        can(currentUser, "properties.view") ? apiFetch(`${API}/vistorias`) : Promise.resolve(null)
      ]);
      if ([c, h, v, f, i].some(response => response && !response.ok)) throw new Error("Não foi possível carregar os dados permitidos a esta conta.");
      setClients(c ? await c.json() : []); setHomes(h ? await h.json() : []); setVisits(v ? await v.json() : []); setPayments(f ? await f.json() : []); setInspections(i ? await i.json() : []); setMessage("");
    } catch { setMessage("Não foi possível carregar os dados. Confira se o PostgreSQL e a API estão em execução."); }
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

  const remove = async (kind, id) => {
    if (kind === "visita") {
      if (!window.confirm("Cancelar esta visita?")) return;
      const response = await apiFetch(`${API}/visitas/${id}/status`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "CANCELADA" }) });
      if (!response.ok) setMessage("Não foi possível cancelar a visita.");
    } else {
      const confirmText = kind === "cliente" ? "Inativar este cliente? O cadastro será mantido no histórico." : "Excluir este imóvel?";
      if (!window.confirm(confirmText)) return;
      const response = await apiFetch(`${API}/${kind === "cliente" ? "clientes" : "imoveis"}/${id}`, { method: "DELETE" });
      if (!response.ok) { const body = await response.json(); setMessage(body.error || "Não foi possível concluir a ação."); return; }
    }
    await refresh();
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
  const setPaymentStatus = async (id, status) => {
    const response = await apiFetch(`${API}/financeiro/pagamentos/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) });
    const result = await response.json();
    if (!response.ok) { setMessage(result.error || "Não foi possível atualizar o pagamento."); return; }
    await refresh();
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

  const query = search.trim().toLocaleLowerCase("pt-BR");
  const visibleHomes = useMemo(() => homes.filter(h => (statusFilter === "TODOS" || h.status === statusFilter) && `${h.codigo} ${h.titulo} ${h.endereco} ${h.cidade} ${h.status}`.toLocaleLowerCase("pt-BR").includes(query)), [homes, statusFilter, query]);
  const visibleClients = useMemo(() => clients.filter(c => `${c.nome} ${c.documento || ""} ${c.email || ""} ${c.telefone || ""} ${c.tipo}`.toLocaleLowerCase("pt-BR").includes(query)), [clients, query]);
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
          <div className="toolbar"><div><h2>Todos os imóveis</h2><p>{visibleHomes.length} resultado(s) na carteira</p></div><div className="toolbar-controls"><SearchBox value={search} onChange={setSearch} label="Buscar por nome, código ou endereço"/><select className="filter-select" aria-label="Filtrar imóveis por situação" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}><option value="TODOS">Todas as situações</option><option value="DISPONIVEL">Disponíveis</option><option value="RESERVADO">Reservados</option><option value="ALUGADO">Alugados</option><option value="VENDIDO">Vendidos</option></select></div></div>
          <HomeGrid homes={visibleHomes} canManage={can(currentUser, "properties.manage")} onEdit={x => edit("imovel", x)} onRemove={id => remove("imovel", id)} onView={x => edit("ficha-imovel", x)} onDeletePhoto={deletePhoto}/>
          {!visibleHomes.length && <Empty title={homes.length ? "Nenhum resultado encontrado" : "Nenhum imóvel cadastrado"} text={homes.length ? "Tente outro termo ou altere o filtro de situação." : "Inclua um imóvel e comece a montar sua carteira."} action={can(currentUser, "properties.manage") ? "Cadastrar imóvel" : null} onAction={newRecord}/>}
        </>}

        {page === "documentos" && <DocumentsLibrary clients={clients} homes={homes} canClients={can(currentUser, "clients.view")} canProperties={can(currentUser, "properties.view")}/>}

        {page === "clientes" && <>
          <div className="toolbar"><div><h2>Seus clientes</h2><p>{visibleClients.length} cadastro(s) ativo(s)</p></div><SearchBox value={search} onChange={setSearch} label="Buscar por nome, documento ou contato"/></div>
          <div className="panel"><div className="table-head"><span>CLIENTE</span><span>PERFIL</span><span>DOCUMENTO</span><span>CONTATO</span><span>AÇÕES</span></div>
            {visibleClients.map(c => <div className="row" key={c.id}><div className="person"><i>{c.nome.slice(0, 1)}</i><span><b>{c.nome}</b><small>{c.email || "Sem e-mail cadastrado"}</small></span></div><span className="role">{roleText[c.tipo] || c.tipo}</span><span>{c.tipoDocumento ? `${documentText[c.tipoDocumento] || c.tipoDocumento} · ` : ""}{c.documento || "—"}</span><span>{c.telefone || "—"}</span><div className="actions"><button onClick={() => edit("ficha-cliente", c)}>Ficha</button>{can(currentUser, "clients.manage") && <><button onClick={() => edit("cliente", c)}>Editar</button><button onClick={() => remove("cliente", c.id)}>Inativar</button></>}</div></div>)}
            {!visibleClients.length && <Empty title={clients.length ? "Nenhum resultado encontrado" : "Nenhum cliente cadastrado"} text={clients.length ? "Tente buscar por outro nome, documento ou contato." : "Cadastre clientes, proprietários, inquilinos e fiadores."} action={can(currentUser, "clients.manage") ? "Cadastrar cliente" : null} onAction={newRecord}/>}
          </div>
        </>}

        {page === "agenda" && <>
          <div className="agenda-overview"><div className="agenda-overview-icon">◷</div><div><span className="eyebrow">COMPROMISSOS CONFIRMADOS</span><h2>{upcomingVisits.length} visita(s) próxima(s)</h2><p>Agende uma visita e acompanhe o atendimento por aqui.</p></div>{can(currentUser, "visits.manage") && <button className="secondary" onClick={newRecord}>＋ Agendar visita</button>}</div>
          <div className="toolbar"><div><h2>Programação</h2><p>Visitas, horários e responsáveis.</p></div><label className="filter-wrap"><span>Situação</span><select className="filter-select" value={visitFilter} onChange={e => setVisitFilter(e.target.value)}><option value="TODOS">Todas</option><option value="AGENDADA">Agendadas</option><option value="REALIZADA">Realizadas</option><option value="CANCELADA">Canceladas</option></select></label></div>
          <VisitList visits={visits.filter(v => visitFilter === "TODOS" || v.status === visitFilter)} canManage={can(currentUser, "visits.manage")} onCancel={id => remove("visita", id)} onComplete={id => updateVisit(id, "REALIZADA")}/>
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
      {dialog === "ficha-cliente" && <ClientSheet client={editing} canManage={can(currentUser, "clients.manage")} onDeleteDocument={deleteDocument}/>}
      {dialog === "ficha-imovel" && <HomeSheet home={editing} canManage={can(currentUser, "properties.manage")} onDeletePhoto={deletePhoto}/>}
    </Modal>}
  </div>;

  async function deletePhoto(homeId, photoId) {
    const response = await apiFetch(`${API}/imoveis/${homeId}/fotos/${photoId}`, { method: "DELETE" });
    if (!response.ok) { setMessage("Não foi possível remover a foto."); return; }
    await refresh();
    if (editing?.id === homeId) setEditing(await (await apiFetch(`${API}/imoveis`)).json().then(rows => rows.find(row => row.id === homeId)));
  }
  async function deleteDocument(clientId, documentId) {
    const response = await apiFetch(`${API}/clientes/${clientId}/documentos/${documentId}`, { method: "DELETE" });
    if (!response.ok) { setMessage("Não foi possível remover o documento."); return; }
    await refresh();
    if (editing?.id === clientId) setEditing(await (await apiFetch(`${API}/clientes`)).json().then(rows => rows.find(row => row.id === clientId)));
  }
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
        {overdue.length ? <><div className="overdue-summary"><b>{overdue.length} cobrança(s) em atraso · {brl(overdueAmount)}</b><span>Confira o histórico antes de registrar um recebimento.</span></div><div className="attention-list">{overdue.slice(0, 4).map(payment => <article key={payment.id}><span><b>{payment.contract.inquilino?.nome || "Inquilino"} · {payment.contract.imovel?.codigo || payment.contract.numero}</b><small>Vencimento {new Date(payment.vencimento).toLocaleDateString("pt-BR")} · {payment.referencia}</small></span><strong>{brl(payment.valor)}</strong>{canFinanceManage && <button onClick={() => onSetPaymentStatus(payment.id, "PAGO")}>Dar baixa</button>}</article>)}</div><button className="secondary" onClick={() => onNavigate("financeiro")}>Consultar cobranças</button></> : <div className="dashboard-empty-state"><b>Carteira em dia</b><span>Nenhuma cobrança vencida foi encontrada.</span></div>}
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
      <div className="home-foot"><strong>{brl(h.valor)}<small>{h.status === "ALUGADO" ? "por mês" : h.status === "VENDIDO" ? "valor de venda" : "valor anunciado"}</small></strong><div><button onClick={() => onView(h)}>Ver ficha</button>{canManage && <><button onClick={() => onEdit(h)}>Editar imóvel</button><button aria-label={`Excluir ${h.titulo}`} onClick={() => onRemove(h.id)}>Excluir</button></>}</div></div>
    </div>
  </article>)}</div>;
}

function VisitList({ visits, onCancel, onComplete, compact = false, canManage = true }) {
  if (!visits.length) return <div className="agenda-empty"><span>◷</span><div><b>Nenhuma visita agendada</b><small>Quando houver uma visita marcada, ela aparecerá aqui.</small></div></div>;
  return <div className={`visit-list ${compact ? "visit-list-compact" : ""}`}>{visits.map(v => {
    const date = new Date(v.inicio);
    return <article className="visit-card" key={v.id}><div className="visit-date"><b>{date.toLocaleDateString("pt-BR", { day: "2-digit" })}</b><span>{date.toLocaleDateString("pt-BR", { month: "short" }).replace(".", "")}</span></div><div className="visit-time">{date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</div><div className="visit-main"><b>{v.imovel?.titulo || "Imóvel"}</b><span>{v.imovel?.endereco} · {v.imovel?.cidade}</span><small>Cliente: {v.cliente?.nome || "—"}{v.corretor ? ` · Corretor(a): ${v.corretor}` : ""}</small>{v.observacoes && <small className="visit-note">{v.observacoes}</small>}</div><span className={`visit-status visit-${v.status.toLowerCase()}`}>{({ AGENDADA: "Agendada", REALIZADA: "Realizada", CANCELADA: "Cancelada" })[v.status] || v.status}</span><div className="visit-actions">{canManage && v.status === "AGENDADA" && <><button className="visit-complete" aria-label="Marcar visita como realizada" onClick={() => onComplete(v.id)}><span>✓</span> Concluir visita</button><button className="visit-cancel" aria-label="Cancelar visita" onClick={() => onCancel(v.id)}>Cancelar</button></>}</div></article>;
  })}</div>;
}

function ClientSheet({ client, onDeleteDocument, canManage }) {
  return <div className="sheet"><div className="sheet-person"><i>{client.nome.slice(0, 1)}</i><div><h3>{client.nome}</h3><span className="role">{roleText[client.tipo] || client.tipo}</span></div><span className="active-pill"><i/> Ativo</span></div>
    <div className="sheet-grid"><SheetItem label="Documento principal" value={`${documentText[client.tipoDocumento] || "Documento"} · ${client.documento || "Não informado"}`}/><SheetItem label="Telefone" value={client.telefone || "Não informado"}/><SheetItem label="E-mail" value={client.email || "Não informado"}/><SheetItem label="Cadastro" value={localDateTime(client.criadoEm)}/></div>
    <section className="attachment-section"><div className="attachment-heading"><div><span className="eyebrow">ARQUIVOS DO CADASTRO</span><h3>Documentos anexados</h3></div><span>{client.anexos?.length || 0} arquivo(s)</span></div>
      {client.anexos?.length ? <div className="attachment-list">{client.anexos.map(doc => <div className="attachment-item" key={doc.id}><span className="file-icon">{doc.mimeType === "application/pdf" ? "PDF" : "IMG"}</span><div><b>{doc.nomeOriginal}</b><small>{attachmentLabels[doc.categoria] || doc.categoria} · {localDateTime(doc.criadoEm)}</small></div><button className="attachment-open" onClick={() => openProtected(`${API}/arquivos/documento/${doc.id}`)}>Abrir ↗</button>{canManage && <button aria-label={`Remover ${doc.nomeOriginal}`} onClick={() => onDeleteDocument(client.id, doc.id)}>×</button>}</div>)}</div> : <p className="attachment-empty">Nenhum documento anexado.</p>}
    </section>
  </div>;
}
function HomeSheet({ home, onDeletePhoto, canManage }) {
  const [photoIndex, setPhotoIndex] = useState(null);
  return <div className="sheet"><div className="home-sheet-heading"><div><span className="home-code">{home.codigo}</span><h3>{home.titulo}</h3><p>{home.endereco} · {home.cidade}</p></div><span className={`status status-${home.status.toLowerCase()}`}>{statusText[home.status] || home.status}</span></div>
    <div className="sheet-grid"><SheetItem label="Tipo" value={home.tipo || "Não informado"}/><SheetItem label="Quartos" value={home.quartos}/><SheetItem label="Valor anunciado" value={brl(home.valor)}/><SheetItem label="Cadastro" value={localDateTime(home.criadoEm)}/></div>
    {home.observacoes && <div className="home-observations"><b>Observações</b><p>{home.observacoes}</p></div>}
    <section className="attachment-section"><div className="attachment-heading"><div><span className="eyebrow">GALERIA DO IMÓVEL</span><h3>Fotos</h3></div><span>{home.fotos?.length || 0} foto(s)</span></div>
      {home.fotos?.length ? <div className="photo-gallery">{home.fotos.map((photo, index) => <div className="gallery-photo" key={photo.id}><button className="gallery-open" aria-label={`Ampliar ${photo.nomeOriginal}`} onClick={() => setPhotoIndex(index)}><ProtectedImage path={`${API}/arquivos/foto/${photo.id}`} alt={photo.nomeOriginal}/><span className="gallery-zoom-hint">Ampliar foto ⤢</span></button>{canManage && <button aria-label={`Remover ${photo.nomeOriginal}`} onClick={() => onDeletePhoto(home.id, photo.id)}>×</button>}</div>)}</div> : <p className="attachment-empty">Ainda não há fotos para este imóvel.</p>}
    </section>
    {photoIndex !== null && <PhotoViewer photos={home.fotos} index={photoIndex} onClose={() => setPhotoIndex(null)} onIndexChange={setPhotoIndex}/>}
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
  const today = new Date();
  const currentReference = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
  const [form, setForm] = useState({ imovelId: "", inquilinoId: "", proprietarioId: "", fiadorId: "", inicio: currentReference + "-01", fim: `${today.getFullYear() + 1}-${String(today.getMonth() + 1).padStart(2, "0")}-01`, diaVencimento: "10", valorAluguel: "", indiceReajuste: "IPCA" });
  const monthlyRent = contracts.reduce((total, contract) => total + Number(contract.valorAluguel), 0);
  const paymentRows = contracts.flatMap(contract => contract.pagamentos.map(payment => ({ ...payment, contract })));
  const received = paymentRows.filter(payment => payment.status === "PAGO").reduce((total, payment) => total + Number(payment.valor), 0);
  const paidCommission = received * 0.1;
  const paidOwnerTransfer = received - paidCommission;
  return <>
    <div className="finance-summary">
      <article><span>ALUGUÉIS MENSAIS CONTRATADOS</span><b>{brl(monthlyRent)}</b><small>{contracts.length} contrato(s) ativo(s)</small></article>
      <article><span>COMISSÃO DA IMOBILIÁRIA · 10%</span><b>{brl(monthlyRent * 0.1)}</b><small>Calculada sobre os aluguéis contratados</small></article>
      <article><span>REPASSE PREVISTO AOS PROPRIETÁRIOS · 90%</span><b>{brl(monthlyRent * 0.9)}</b><small>Valor mensal líquido da comissão</small></article>
    </div>
    <div className="finance-rule"><span>i</span><p>A cada aluguel recebido, <b>10% ficam com a Perugine</b> como comissão de administração e <b>90% são repassados ao proprietário</b>. Os valores desta ficha são calculados por contrato e pelos pagamentos registrados.</p></div>
    <div className="finance-section-head"><div><span className="eyebrow">CARTEIRA DE LOCAÇÕES</span><h2>Contratos ativos</h2><p>Valores mensais, comissão e repasse por imóvel.</p></div>{canManage && <button className="primary" onClick={() => setCreating(value => !value)}>{creating ? "Fechar formulário" : "＋ Nova locação"}</button>}</div>
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
        <label>Índice de reajuste<input value={form.indiceReajuste} onChange={event => setForm({ ...form, indiceReajuste: event.target.value })} placeholder="Ex.: IPCA"/></label></div>
      {(!homes.some(home => ["DISPONIVEL", "RESERVADO"].includes(home.status)) || !clients.some(client => client.tipo === "INQUILINO") || !clients.some(client => client.tipo === "PROPRIETARIO")) && <small className="finance-form-help">Cadastre um imóvel disponível, um cliente como inquilino e outro como proprietário antes de criar a locação.</small>}
      <div className="form-actions"><button type="button" className="secondary" onClick={() => setCreating(false)}>Cancelar</button><button className="primary" disabled={saving || !homes.some(home => ["DISPONIVEL", "RESERVADO"].includes(home.status)) || !clients.some(client => client.tipo === "INQUILINO") || !clients.some(client => client.tipo === "PROPRIETARIO")}>{saving ? "Salvando…" : "Criar contrato"}</button></div>
    </form>}
    {contracts.length ? <div className="finance-contract-list">{contracts.map(contract => <article className="finance-contract" key={contract.id}>
      <div className="finance-contract-title"><span><b>{contract.imovel.titulo}</b><small>{contract.numero} · {contract.imovel.endereco}, {contract.imovel.cidade}</small></span><em>Ativo</em></div>
      <div className="finance-contract-people"><span><small>INQUILINO</small><b>{contract.inquilino.nome}</b></span><span><small>PROPRIETÁRIO</small><b>{contract.proprietario.nome}</b></span><span><small>VENCIMENTO</small><b>Dia {contract.diaVencimento}</b></span></div>
      <div className="finance-contract-values"><span><small>Aluguel mensal</small><b>{brl(contract.valorAluguel)}</b></span><span><small>Comissão Perugine · 10%</small><b>{brl(Number(contract.valorAluguel) * 0.1)}</b></span><span><small>Repasse ao proprietário · 90%</small><b>{brl(Number(contract.valorAluguel) * 0.9)}</b></span></div>
      {canManage && <AdjustmentForm contract={contract} onApply={onApplyAdjustment}/>}
      <FinancialStatement contract={contract} currentReference={currentReference} canManage={canManage} onCreatePayment={onCreatePayment} onSetPaymentStatus={onSetPaymentStatus} onReceipt={payment => setReceipt({ contract, payment })}/>
    </article>)}</div> : <Empty title="Nenhuma locação cadastrada" text="Quando houver contratos de aluguel ativos, a comissão de 10% e o repasse líquido de 90% aparecerão aqui."/>}
    <div className="finance-received"><span>Recebido em pagamentos marcados como pagos</span><b>{brl(received)}</b><small>Comissão: {brl(paidCommission)} · Repasse: {brl(paidOwnerTransfer)}</small></div>
    {receipt && <ReceiptModal contract={receipt.contract} payment={receipt.payment} onClose={() => setReceipt(null)}/>}
  </>;
}

function AdjustmentForm({ contract, onApply }) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [indice, setIndice] = useState(contract.indiceReajuste === "IGP-M" ? "IGP-M" : "IPCA");
  const [percentual, setPercentual] = useState("");
  const preview = Number(contract.valorAluguel) * (1 + Number(percentual || 0) / 100);
  return <div className="adjustment-box">
    <div className="adjustment-history"><span><b>Reajustes e aditamentos</b><small>{contract.indiceReajuste || "Índice não definido no contrato"}</small></span>{contract.aditamentos?.length ? <div>{contract.aditamentos.map(item => <small key={item.id}>{new Date(item.aplicadoEm).toLocaleDateString("pt-BR")} · {item.indice || "Aditamento"} · {brl(item.valorAnterior)} → <b>{brl(item.valorNovo)}</b></small>)}</div> : <small>Nenhum reajuste registrado.</small>}</div>
    <button type="button" className="adjustment-toggle" onClick={() => setOpen(value => !value)}>{open ? "Fechar reajuste" : "＋ Aplicar reajuste"}</button>
    {open && <form className="adjustment-form" onSubmit={async event => { event.preventDefault(); setSaving(true); const saved = await onApply(contract.id, { indice, percentual: Number(percentual) }); setSaving(false); if (saved) { setOpen(false); setPercentual(""); } }}><label>Índice<select value={indice} onChange={event => setIndice(event.target.value)}><option>IPCA</option><option>IGP-M</option></select></label><label>Percentual acumulado (%)<input type="number" required min="-99.99" max="1000" step="0.01" value={percentual} onChange={event => setPercentual(event.target.value)} placeholder="Ex.: 4,50"/></label><span className="adjustment-preview">Novo aluguel <b>{brl(preview)}</b></span><small>Informe o percentual apurado para o período; o sistema não consulta índices externos.</small><button className="primary" disabled={saving}>{saving ? "Salvando…" : "Registrar aditamento"}</button></form>}
  </div>;
}

function FinancialStatement({ contract, currentReference, canManage, onCreatePayment, onSetPaymentStatus, onReceipt }) {
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
    const debit = Number(contract.valorAluguel);
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
      return <tr key={row.reference}><td><b>{new Date(`${row.reference}-02T12:00:00`).toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}</b><small>Venc. {due.toLocaleDateString("pt-BR")}</small></td><td>{row.payment ? `Aluguel · ${row.reference}` : "Aluguel mensal"}</td><td>{brl(row.debit)}</td><td className={row.credit ? "ledger-credit" : ""}>{row.credit ? brl(row.credit) : "—"}</td><td className={row.balance > 0 ? "ledger-balance" : "ledger-settled"}>{brl(row.balance)}</td><td>{row.payment?.status === "PAGO" ? <div className="ledger-actions"><span className="ledger-paid">Pago</span><button type="button" onClick={() => onReceipt(row.payment)}>Recibo</button></div> : <div className="ledger-actions"><span className="ledger-open">{state}</span>{canManage && (row.payment ? <button type="button" onClick={() => onSetPaymentStatus(row.payment.id, "PAGO")}>Confirmar</button> : row.reference <= currentReference && <button type="button" onClick={() => onCreatePayment(contract.id, row.reference)}>Lançar cobrança</button>)}</div>}</td></tr>;
    })}</tbody></table></div>
    {canManage && currentIsWithinContract && !currentPayment && !rows.some(row => row.reference === currentReference) && <button type="button" className="finance-payment-add" onClick={() => onCreatePayment(contract.id, currentReference)}>＋ Lançar cobrança de {currentReference}</button>}
    <div className="ledger-footnote"><span>Comissão Perugine (10%) sobre valores recebidos</span><b>{brl(contract.pagamentos.filter(payment => payment.status === "PAGO").reduce((sum, payment) => sum + Number(payment.valor) * .1, 0))}</b><span>Repasse líquido ao proprietário (90%)</span><b>{brl(contract.pagamentos.filter(payment => payment.status === "PAGO").reduce((sum, payment) => sum + Number(payment.valor) * .9, 0))}</b></div>
  </section>;
}

function ReceiptModal({ contract, payment, onClose }) {
  const amount = Number(payment.valor);
  const receivedAt = payment.pagoEm ? new Date(payment.pagoEm) : new Date();
  return <div className="receipt-overlay"><section className="receipt-paper"><div className="receipt-brand"><span className="logo">P</span><span><b>PERUGINE</b><small>GESTÃO IMOBILIÁRIA</small></span></div><div className="receipt-label">RECIBO DE PAGAMENTO DE ALUGUEL</div><div className="receipt-number">{payment.recibo || `REC-${new Date().getFullYear()}-${String(payment.id).padStart(6, "0")}`}</div><p>Recebemos de <b>{contract.inquilino.nome}</b> a importância de <b>{brl(amount)}</b>, referente ao aluguel do imóvel abaixo.</p><div className="receipt-details"><span>IMÓVEL<b>{contract.imovel.titulo} · {contract.imovel.endereco}, {contract.imovel.cidade}</b></span><span>CONTRATO<b>{contract.numero}</b></span><span>COMPETÊNCIA<b>{payment.referencia}</b></span><span>DATA DO PAGAMENTO<b>{receivedAt.toLocaleDateString("pt-BR")}</b></span></div><div className="receipt-breakdown"><span>Valor recebido<b>{brl(amount)}</b></span><span>Comissão da imobiliária · 10%<b>{brl(amount * .1)}</b></span><span>Repasse ao proprietário · 90%<b>{brl(amount * .9)}</b></span></div><p className="receipt-owner">Proprietário: <b>{contract.proprietario.nome}</b></p><div className="receipt-signature">Perugine · Gestão Imobiliária</div><div className="receipt-buttons"><button className="secondary" onClick={onClose}>Fechar</button><button className="primary" onClick={() => window.print()}>Imprimir / Salvar em PDF</button></div></section></div>;
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
