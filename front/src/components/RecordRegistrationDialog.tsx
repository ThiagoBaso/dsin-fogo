import { FormEvent, useEffect, useMemo, useState, type ComponentType, type CSSProperties, type ReactNode } from 'react';
import { CircleMarker, MapContainer, TileLayer, useMap, useMapEvents } from 'react-leaflet';
import { attributeLabels } from './equipment-details/labels';
import './RecordRegistrationDialog.css';

type RecordKind = 'equipamento' | 'agente' | 'ocorrencia';
type OrganizationOption = { id: number; nome: string; sigla: string | null };
type EquipmentTypeOption = { id: number; nome: string; mobilidade: 'fixo' | 'movel' };
type SituationOption = { id: number; nome: string; disponivel: boolean };
type AttributeOption = {
  id: number;
  tipo_id: number;
  nome: string;
  tipo_valor: 'texto' | 'numero' | 'booleano';
  unidade: string | null;
  obrigatorio: boolean;
};
type NeighborhoodOption = { id: number; nome: string; regiao: string };
type LinkedEquipmentOption = { id: number; orgao_id: number; numero_serie: string; modelo: string; tipo: string };
type EquipmentAttributePayload = {
  id_atributo: number;
  valor_texto?: string;
  valor_numero?: number;
  valor_booleano?: boolean;
};
type RegistrationOptions = {
  orgaos: OrganizationOption[];
  tipos_equipamento: EquipmentTypeOption[];
  situacoes_equipamento: SituationOption[];
  atributos_equipamento: AttributeOption[];
  bairros: NeighborhoodOption[];
  equipamentos: LinkedEquipmentOption[];
  tipos_ocorrencia: string[];
  localizacao_padrao: { cidade: string; uf: string };
};
export type CreatedRecord = { kind: RecordKind; id: number };
type LocationForm = {
  bairro_id: string;
  cep: string;
  cidade: string;
  uf: string;
  logradouro: string;
  referencia: string;
  latitude: string;
  longitude: string;
};

interface RecordRegistrationDialogProps {
  open: boolean;
  dark: boolean;
  onClose: () => void;
  onCreated: (record: CreatedRecord) => void;
}

interface RegistrationMapProps {
  center: [number, number];
  zoom: number;
  style: CSSProperties;
  scrollWheelZoom: boolean;
  children?: ReactNode;
}

const PickerMap = MapContainer as unknown as ComponentType<RegistrationMapProps>;
const PickerTiles = TileLayer as unknown as ComponentType<{ url: string; attribution: string }>;
const PickerCircle = CircleMarker as unknown as ComponentType<{
  center: [number, number];
  radius: number;
  pathOptions: { color: string; weight: number; fillColor: string; fillOpacity: number };
}>;
const initialLocation: LocationForm = {
  bairro_id: '',
  cep: '',
  cidade: 'Marília',
  uf: 'SP',
  logradouro: '',
  referencia: '',
  latitude: '-22.217',
  longitude: '-49.950',
};

function localDateTimeNow() {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

function localDateTimeAfterMinute() {
  const future = new Date(Date.now() + 60000);
  return new Date(future.getTime() - future.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

function responseErrorMessage(data: unknown, status: number) {
  const detail = (data as { detail?: unknown } | null)?.detail;
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail)) {
    const messages = detail
      .map((item) => (item as { msg?: unknown } | null)?.msg)
      .filter((message): message is string => typeof message === 'string');
    if (messages.length) return messages.join(' ');
  }
  return `A API respondeu ${status}.`;
}

function LocationMapEvents({
  position,
  onPick,
}: {
  position: [number, number];
  onPick: (latitude: number, longitude: number) => void;
}) {
  const map = useMap();
  useMapEvents({ click: (event: { latlng: { lat: number; lng: number } }) => onPick(event.latlng.lat, event.latlng.lng) });
  useEffect(() => {
    map.setView(position, Math.max(map.getZoom(), 15), { animate: false });
  }, [map, position]);
  return (
    <PickerCircle
      center={position}
      radius={8}
      pathOptions={{ color: '#263541', weight: 2, fillColor: '#FECC00', fillOpacity: 1 }}
    />
  );
}

function RegistrationMapTheme({ dark }: { dark: boolean }) {
  const map = useMap();
  useEffect(() => {
    const tilePane = map.getPane('tilePane');
    tilePane?.classList.toggle('map-theme-dark', dark);
  }, [dark, map]);
  return null;
}

function RecordRegistrationDialog({ open, dark, onClose, onCreated }: RecordRegistrationDialogProps) {
  const [kind, setKind] = useState<RecordKind>('equipamento');
  const [options, setOptions] = useState<RegistrationOptions | null>(null);
  const [loadingOptions, setLoadingOptions] = useState(true);
  const [optionsError, setOptionsError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [created, setCreated] = useState<CreatedRecord | null>(null);
  const [organizationId, setOrganizationId] = useState('');
  const [location, setLocation] = useState<LocationForm>(initialLocation);
  const [equipmentTypeId, setEquipmentTypeId] = useState('');
  const [situationId, setSituationId] = useState('');
  const [serialNumber, setSerialNumber] = useState('');
  const [brand, setBrand] = useState('');
  const [model, setModel] = useState('');
  const [installedAt, setInstalledAt] = useState('');
  const [attributes, setAttributes] = useState<Record<number, string | boolean>>({});
  const [maintenanceEnabled, setMaintenanceEnabled] = useState(false);
  const [maintenanceMode, setMaintenanceMode] = useState<'preventiva' | 'corretiva'>('preventiva');
  const [maintenancePriority, setMaintenancePriority] = useState<'imediata' | 'agendada'>('imediata');
  const [maintenanceDescription, setMaintenanceDescription] = useState('');
  const [maintenanceDate, setMaintenanceDate] = useState('');
  const [registrationNumber, setRegistrationNumber] = useState('');
  const [agentName, setAgentName] = useState('');
  const [agentRole, setAgentRole] = useState('');
  const [agentRadius, setAgentRadius] = useState('0.5');
  const [agentActive, setAgentActive] = useState(true);
  const [occurrenceType, setOccurrenceType] = useState('');
  const [occurrenceSeverity, setOccurrenceSeverity] = useState<'baixa' | 'media' | 'alta' | 'critica'>('media');
  const [occurrenceStatus, setOccurrenceStatus] = useState<'aberta' | 'em_atendimento' | 'resolvida' | 'cancelada'>('aberta');
  const [occurrenceDescription, setOccurrenceDescription] = useState('');
  const [occurrenceDate, setOccurrenceDate] = useState(localDateTimeNow);
  const [resolvedDate, setResolvedDate] = useState('');
  const [linkedEquipmentId, setLinkedEquipmentId] = useState('');

  useEffect(() => {
    if (!open) return undefined;
    const controller = new AbortController();
    setLoadingOptions(true);
    setOptionsError('');
    fetch(`${process.env.REACT_APP_API_URL || ''}/api/cadastros/opcoes`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) {
          const data = await response.json().catch(() => null);
          throw new Error(responseErrorMessage(data, response.status));
        }
        return response.json() as Promise<RegistrationOptions>;
      })
      .then((data) => {
        if (controller.signal.aborted) return;
        setOptions(data);
        setOrganizationId((current) => current || String(data.orgaos[0]?.id ?? ''));
        setEquipmentTypeId((current) => current || String(data.tipos_equipamento[0]?.id ?? ''));
        setSituationId((current) => current || String(data.situacoes_equipamento[0]?.id ?? ''));
        setLocation((current) => ({
          ...current,
          cidade: current.cidade === initialLocation.cidade ? data.localizacao_padrao.cidade : current.cidade,
          uf: current.uf === initialLocation.uf ? data.localizacao_padrao.uf : current.uf,
        }));
      })
      .catch((error: Error) => {
        if (!controller.signal.aborted) setOptionsError(error.message || 'Não foi possível carregar as opções de cadastro.');
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoadingOptions(false);
      });
    return () => controller.abort();
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !submitting) onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, onClose, submitting]);

  const equipmentAttributes = useMemo(() => options?.atributos_equipamento
    .filter((attribute) => attribute.tipo_id === Number(equipmentTypeId)) ?? [], [options, equipmentTypeId]);
  const selectedSituation = options?.situacoes_equipamento.find((situation) => situation.id === Number(situationId));
  const equipmentForOrganization = options?.equipamentos.filter((equipment) =>
    !organizationId || equipment.orgao_id === Number(organizationId)) ?? [];
  const parsedLatitude = Number(location.latitude);
  const parsedLongitude = Number(location.longitude);
  const mapPosition: [number, number] = Number.isFinite(parsedLatitude) && Number.isFinite(parsedLongitude)
    ? [parsedLatitude, parsedLongitude]
    : [-22.217, -49.950];

  if (!open) return null;

  const setLocationCoordinates = (latitude: number, longitude: number) => {
    setLocation((current) => ({
      ...current,
      latitude: latitude.toFixed(7),
      longitude: longitude.toFixed(7),
    }));
  };

  const locationPayload = () => ({
    bairro_id: Number(location.bairro_id),
    cep: location.cep || null,
    cidade: location.cidade,
    uf: location.uf,
    logradouro: location.logradouro || null,
    referencia: location.referencia || null,
    latitude: Number(location.latitude),
    longitude: Number(location.longitude),
  });

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!options) return;
    setSubmitting(true);
    setSubmitError('');
    const body: Record<string, unknown> = { orgao_id: Number(organizationId), localizacao: locationPayload() };
    let endpoint = '';
    if (kind === 'equipamento') {
      endpoint = '/api/equipamentos';
      body.tipo_id = Number(equipmentTypeId);
      body.situacao_id = Number(situationId);
      body.numero_serie = serialNumber;
      body.marca = brand;
      body.modelo = model;
      body.instalado_em = installedAt || null;
      body.atributos = equipmentAttributes.reduce<EquipmentAttributePayload[]>((result, attribute) => {
        const value = attributes[attribute.id];
        if (attribute.tipo_valor === 'booleano') {
          if (value === undefined || value === '') {
            if (attribute.obrigatorio) result.push({ id_atributo: attribute.id, valor_booleano: false });
            return result;
          }
          result.push({ id_atributo: attribute.id, valor_booleano: value === true });
          return result;
        }
        if (value === undefined || value === '') return result;
        result.push(attribute.tipo_valor === 'numero'
          ? { id_atributo: attribute.id, valor_numero: Number(value) }
          : { id_atributo: attribute.id, valor_texto: String(value) });
        return result;
      }, []);
      body.manutencao = maintenanceEnabled ? {
        modalidade: maintenanceMode,
        prioridade: maintenancePriority,
        status: maintenancePriority === 'agendada' ? 'agendada' : 'pendente',
        descricao: maintenanceDescription || null,
        prevista_para: maintenancePriority === 'agendada' ? maintenanceDate : null,
      } : null;
    } else if (kind === 'agente') {
      endpoint = '/api/agentes';
      body.matricula = registrationNumber;
      body.nome = agentName;
      body.cargo = agentRole;
      body.raio_atuacao_km = Number(agentRadius);
      body.ativo_cadastro = agentActive;
    } else {
      endpoint = '/api/ocorrencias';
      body.equipamento_id = linkedEquipmentId ? Number(linkedEquipmentId) : null;
      body.tipo = occurrenceType;
      body.gravidade = occurrenceSeverity;
      body.status = occurrenceStatus;
      body.descricao = occurrenceDescription || null;
      body.ocorrida_em = occurrenceDate;
      body.resolvida_em = occurrenceStatus === 'resolvida' ? resolvedDate : null;
    }

    try {
      const response = await fetch(`${process.env.REACT_APP_API_URL || ''}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const result = await response.json().catch(() => null) as { id?: number } | null;
      if (!response.ok) throw new Error(responseErrorMessage(result, response.status));
      if (!result?.id) throw new Error('A API não retornou a identificação do cadastro criado.');
      const record = { kind, id: result.id };
      setCreated(record);
      onCreated(record);
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : 'Não foi possível salvar o cadastro.');
    } finally {
      setSubmitting(false);
    }
  };

  const closeAfterCreate = () => {
    setCreated(null);
    onClose();
  };

  const title = kind === 'equipamento' ? 'Cadastrar equipamento' : kind === 'agente' ? 'Cadastrar agente' : 'Cadastrar ocorrência';
  const createdName = created?.kind === 'equipamento' ? 'equipamento' : created?.kind === 'agente' ? 'agente' : 'ocorrência';

  return (
    <div className="registration-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget && !submitting) onClose(); }}>
      <section className="registration-dialog" role="dialog" aria-modal="true" aria-labelledby="registration-title" data-theme={dark ? 'dark' : 'light'}>
        <header className="registration-header">
          <div>
            <p className="registration-eyebrow">Novo cadastro</p>
            <h2 id="registration-title">{created ? 'Cadastro salvo' : title}</h2>
          </div>
          <button type="button" className="registration-close" aria-label="Fechar cadastro" onClick={created ? closeAfterCreate : onClose} disabled={submitting}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" /></svg>
          </button>
        </header>

        {created ? (
          <div className="registration-success" role="status">
            <span className="registration-success-icon" aria-hidden="true">✓</span>
            <h3>{createdName[0].toLocaleUpperCase('pt-BR') + createdName.slice(1)} #{created.id} foi cadastrado.</h3>
            <p>As listas e o mapa foram atualizados. Os filtros atuais podem ocultar o novo registro da visualização.</p>
            <button type="button" className="registration-primary" onClick={closeAfterCreate}>Concluir</button>
          </div>
        ) : (
          <>
            <div className="registration-tabs" role="group" aria-label="Tipo de cadastro">
              {([
                ['equipamento', 'Equipamento'],
                ['agente', 'Agente'],
                ['ocorrencia', 'Ocorrência'],
              ] as const).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={kind === value}
                  className={kind === value ? 'is-active' : ''}
                  onClick={() => { setKind(value); setSubmitError(''); }}
                >{label}</button>
              ))}
            </div>

            {loadingOptions ? <p className="registration-message" role="status">Carregando opções do cadastro…</p> : null}
            {optionsError ? <p className="registration-message is-error" role="alert">{optionsError}</p> : null}
            {!loadingOptions && !optionsError && options && (
              <form onSubmit={submit} className="registration-form">
                <section className="registration-section">
                  <div className="registration-section-heading">
                    <div><h3>Identificação</h3><p>Informações principais do registro.</p></div>
                  </div>
                  <div className="registration-grid">
                    <label className="registration-field">
                      <span>Órgão responsável <b aria-hidden="true">*</b></span>
                      <select required autoFocus value={organizationId} onChange={(event) => { setOrganizationId(event.target.value); setLinkedEquipmentId(''); }}>
                        <option value="">Selecione</option>
                        {options.orgaos.map((organization) => <option key={organization.id} value={organization.id}>{organization.nome}{organization.sigla ? ` (${organization.sigla})` : ''}</option>)}
                      </select>
                    </label>

                    {kind === 'equipamento' && <>
                      <label className="registration-field">
                        <span>Tipo <b aria-hidden="true">*</b></span>
                        <select required value={equipmentTypeId} onChange={(event) => { setEquipmentTypeId(event.target.value); setAttributes({}); }}>
                          <option value="">Selecione</option>
                          {options.tipos_equipamento.map((type) => <option key={type.id} value={type.id}>{type.nome}</option>)}
                        </select>
                      </label>
                      <label className="registration-field">
                        <span>Número de série <b aria-hidden="true">*</b></span>
                        <input required maxLength={120} value={serialNumber} onChange={(event) => setSerialNumber(event.target.value)} />
                      </label>
                      <label className="registration-field">
                        <span>Marca <b aria-hidden="true">*</b></span>
                        <input required maxLength={100} value={brand} onChange={(event) => setBrand(event.target.value)} />
                      </label>
                      <label className="registration-field">
                        <span>Modelo <b aria-hidden="true">*</b></span>
                        <input required maxLength={100} value={model} onChange={(event) => setModel(event.target.value)} />
                      </label>
                      <label className="registration-field">
                        <span>Situação <b aria-hidden="true">*</b></span>
                        <select required value={situationId} onChange={(event) => {
                          setSituationId(event.target.value);
                          const selected = options.situacoes_equipamento.find((situation) => situation.id === Number(event.target.value));
                          if (selected?.nome.trim().toLocaleLowerCase('pt-BR') === 'ainda não instalado') setInstalledAt('');
                        }}>
                          <option value="">Selecione</option>
                          {options.situacoes_equipamento.map((situation) => <option key={situation.id} value={situation.id}>{situation.nome}</option>)}
                        </select>
                      </label>
                      <label className="registration-field">
                        <span>Data de instalação</span>
                        <input type="datetime-local" max={localDateTimeNow()} value={installedAt} onChange={(event) => setInstalledAt(event.target.value)} disabled={selectedSituation?.nome.trim().toLocaleLowerCase('pt-BR') === 'ainda não instalado'} />
                      </label>
                    </>}

                    {kind === 'agente' && <>
                      <label className="registration-field">
                        <span>Matrícula <b aria-hidden="true">*</b></span>
                        <input required maxLength={60} value={registrationNumber} onChange={(event) => setRegistrationNumber(event.target.value)} />
                      </label>
                      <label className="registration-field">
                        <span>Nome completo <b aria-hidden="true">*</b></span>
                        <input required maxLength={150} value={agentName} onChange={(event) => setAgentName(event.target.value)} />
                      </label>
                      <label className="registration-field">
                        <span>Cargo <b aria-hidden="true">*</b></span>
                        <input required maxLength={100} value={agentRole} onChange={(event) => setAgentRole(event.target.value)} />
                      </label>
                      <label className="registration-field">
                        <span>Área de atuação (km) <b aria-hidden="true">*</b></span>
                        <input required type="number" min="0.01" max="25" step="0.01" value={agentRadius} onChange={(event) => setAgentRadius(event.target.value)} />
                      </label>
                      <label className="registration-checkbox">
                        <input type="checkbox" checked={agentActive} onChange={(event) => setAgentActive(event.target.checked)} />
                        <span>Cadastro ativo</span>
                      </label>
                    </>}

                    {kind === 'ocorrencia' && <>
                      <label className="registration-field">
                        <span>Tipo de ocorrência <b aria-hidden="true">*</b></span>
                        <input required maxLength={100} list="registration-occurrence-types" value={occurrenceType} onChange={(event) => setOccurrenceType(event.target.value)} />
                        <datalist id="registration-occurrence-types">{options.tipos_ocorrencia.map((type) => <option key={type} value={type} />)}</datalist>
                      </label>
                      <label className="registration-field">
                        <span>Gravidade <b aria-hidden="true">*</b></span>
                        <select value={occurrenceSeverity} onChange={(event) => setOccurrenceSeverity(event.target.value as typeof occurrenceSeverity)}>
                          <option value="baixa">Baixa</option><option value="media">Média</option><option value="alta">Alta</option><option value="critica">Crítica</option>
                        </select>
                      </label>
                      <label className="registration-field">
                        <span>Status <b aria-hidden="true">*</b></span>
                        <select value={occurrenceStatus} onChange={(event) => { setOccurrenceStatus(event.target.value as typeof occurrenceStatus); if (event.target.value !== 'resolvida') setResolvedDate(''); }}>
                          <option value="aberta">Aberta</option><option value="em_atendimento">Em atendimento</option><option value="resolvida">Resolvida</option><option value="cancelada">Cancelada</option>
                        </select>
                      </label>
                      <label className="registration-field">
                        <span>Data e hora da ocorrência <b aria-hidden="true">*</b></span>
                        <input required type="datetime-local" max={localDateTimeNow()} value={occurrenceDate} onChange={(event) => setOccurrenceDate(event.target.value)} />
                      </label>
                      {occurrenceStatus === 'resolvida' && <label className="registration-field">
                        <span>Data e hora da resolução <b aria-hidden="true">*</b></span>
                        <input required type="datetime-local" min={occurrenceDate} max={localDateTimeNow()} value={resolvedDate} onChange={(event) => setResolvedDate(event.target.value)} />
                      </label>}
                      <label className="registration-field">
                        <span>Equipamento relacionado</span>
                        <select value={linkedEquipmentId} onChange={(event) => setLinkedEquipmentId(event.target.value)}>
                          <option value="">Nenhum</option>
                          {equipmentForOrganization.map((equipment) => <option key={equipment.id} value={equipment.id}>{equipment.tipo} · {equipment.numero_serie}</option>)}
                        </select>
                      </label>
                      <label className="registration-field registration-field-wide">
                        <span>Descrição</span>
                        <textarea maxLength={10000} rows={3} value={occurrenceDescription} onChange={(event) => setOccurrenceDescription(event.target.value)} />
                      </label>
                    </>}
                  </div>
                </section>

                {kind === 'equipamento' && equipmentAttributes.length > 0 && <section className="registration-section">
                  <div className="registration-section-heading"><div><h3>Características</h3><p>Campos definidos para este tipo de equipamento.</p></div></div>
                  <div className="registration-grid">
                    {equipmentAttributes.map((attribute) => {
                      const label = attributeLabels[attribute.nome] || attribute.nome.replace(/_/g, ' ');
                      const value = attributes[attribute.id];
                      if (attribute.tipo_valor === 'booleano') return (
                        <label className="registration-field" key={attribute.id}>
                          <span>{label}{attribute.obrigatorio && <b aria-hidden="true"> *</b>}</span>
                          <select
                            required={attribute.obrigatorio}
                            value={value === undefined ? '' : String(value)}
                            onChange={(event) => setAttributes((current) => ({
                              ...current,
                              [attribute.id]: event.target.value === '' ? '' : event.target.value === 'true',
                            }))}
                          >
                            <option value="" disabled={attribute.obrigatorio}>{attribute.obrigatorio ? 'Selecione' : 'Não informado'}</option>
                            <option value="false">Não</option>
                            <option value="true">Sim</option>
                          </select>
                        </label>
                      );
                      return <label className="registration-field" key={attribute.id}>
                        <span>{label}{attribute.obrigatorio && <b aria-hidden="true"> *</b>}{attribute.unidade ? ` (${attribute.unidade})` : ''}</span>
                        <input
                          required={attribute.obrigatorio}
                          type={attribute.tipo_valor === 'numero' ? 'number' : 'text'}
                          step={attribute.tipo_valor === 'numero' ? 'any' : undefined}
                          min={attribute.nome === 'raio_cobertura_km' ? '0.01' : undefined}
                          max={attribute.nome === 'raio_cobertura_km' ? '100' : undefined}
                          value={value === undefined ? '' : String(value)}
                          onChange={(event) => setAttributes((current) => ({ ...current, [attribute.id]: event.target.value }))}
                        />
                      </label>;
                    })}
                  </div>
                </section>}

                {kind === 'equipamento' && <section className="registration-section">
                  <label className="registration-checkbox registration-section-toggle">
                    <input type="checkbox" checked={maintenanceEnabled} onChange={(event) => setMaintenanceEnabled(event.target.checked)} />
                    <span><strong>Registrar manutenção</strong><small>Opcional; será vinculada ao equipamento.</small></span>
                  </label>
                  {maintenanceEnabled && <div className="registration-grid registration-subsection">
                    <label className="registration-field"><span>Modalidade <b aria-hidden="true">*</b></span><select value={maintenanceMode} onChange={(event) => setMaintenanceMode(event.target.value as typeof maintenanceMode)}><option value="preventiva">Preventiva</option><option value="corretiva">Corretiva</option></select></label>
                    <label className="registration-field"><span>Prioridade <b aria-hidden="true">*</b></span><select value={maintenancePriority} onChange={(event) => setMaintenancePriority(event.target.value as typeof maintenancePriority)}><option value="imediata">Imediata</option><option value="agendada">Agendada</option></select></label>
                    {maintenancePriority === 'agendada' && <label className="registration-field"><span>Agendada para <b aria-hidden="true">*</b></span><input required type="datetime-local" min={localDateTimeAfterMinute()} value={maintenanceDate} onChange={(event) => setMaintenanceDate(event.target.value)} /></label>}
                    <label className="registration-field registration-field-wide"><span>Descrição da manutenção</span><textarea maxLength={5000} rows={2} value={maintenanceDescription} onChange={(event) => setMaintenanceDescription(event.target.value)} /></label>
                  </div>}
                </section>}

                <section className="registration-section">
                  <div className="registration-section-heading">
                    <div><h3>Localização</h3><p>Clique no mapa para definir as coordenadas. Também é possível digitá-las abaixo.</p></div>
                  </div>
                  <div className="registration-map">
                    <PickerMap center={mapPosition} zoom={15} scrollWheelZoom style={{ height: '100%', width: '100%' }}>
                      <RegistrationMapTheme dark={dark} />
                      <PickerTiles url="https://tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="&copy; OpenStreetMap contributors" />
                      <LocationMapEvents position={mapPosition} onPick={setLocationCoordinates} />
                    </PickerMap>
                  </div>
                  <div className="registration-grid registration-location-fields">
                    <label className="registration-field registration-field-wide">
                      <span>Bairro <b aria-hidden="true">*</b></span>
                      <select required value={location.bairro_id} onChange={(event) => setLocation((current) => ({ ...current, bairro_id: event.target.value }))}>
                        <option value="">Selecione o bairro</option>
                        {options.bairros.map((neighborhood) => <option key={neighborhood.id} value={neighborhood.id}>{neighborhood.nome} · {neighborhood.regiao}</option>)}
                      </select>
                    </label>
                    <label className="registration-field"><span>Cidade <b aria-hidden="true">*</b></span><input required maxLength={100} value={location.cidade} onChange={(event) => setLocation((current) => ({ ...current, cidade: event.target.value }))} /></label>
                    <label className="registration-field"><span>UF <b aria-hidden="true">*</b></span><input required minLength={2} maxLength={2} value={location.uf} onChange={(event) => setLocation((current) => ({ ...current, uf: event.target.value.toUpperCase() }))} /></label>
                    <label className="registration-field"><span>Latitude <b aria-hidden="true">*</b></span><input required type="number" min="-90" max="90" step="any" value={location.latitude} onChange={(event) => setLocation((current) => ({ ...current, latitude: event.target.value }))} /></label>
                    <label className="registration-field"><span>Longitude <b aria-hidden="true">*</b></span><input required type="number" min="-180" max="180" step="any" value={location.longitude} onChange={(event) => setLocation((current) => ({ ...current, longitude: event.target.value }))} /></label>
                    <label className="registration-field"><span>CEP</span><input inputMode="numeric" maxLength={9} value={location.cep} onChange={(event) => setLocation((current) => ({ ...current, cep: event.target.value }))} /></label>
                    <label className="registration-field"><span>Logradouro</span><input maxLength={180} value={location.logradouro} onChange={(event) => setLocation((current) => ({ ...current, logradouro: event.target.value }))} /></label>
                    <label className="registration-field"><span>Ponto de referência</span><input maxLength={255} value={location.referencia} onChange={(event) => setLocation((current) => ({ ...current, referencia: event.target.value }))} /></label>
                  </div>
                </section>

                {submitError && <p className="registration-message is-error" role="alert">{submitError}</p>}
                <footer className="registration-actions">
                  <button type="button" className="registration-secondary" onClick={onClose} disabled={submitting}>Cancelar</button>
                  <button type="submit" className="registration-primary" disabled={submitting || !options}>
                    {submitting ? 'Salvando…' : 'Salvar cadastro'}
                  </button>
                </footer>
              </form>
            )}
          </>
        )}
      </section>
    </div>
  );
}

export default RecordRegistrationDialog;
