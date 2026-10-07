import { useState, type FormEvent } from 'react';
import { Loader2, Pencil, Play, Plus, Tractor, Truck, X } from 'lucide-react';
import {
  SOMPO_VEHICLE_MODELS_3D,
  SOMPO_VEHICLE_TYPES,
  defaultModel3dFor,
  validateSompoVehicle,
  checkSompoVehicleModel,
  type SompoVehicle,
  type SompoVehicleModel3dId,
  type SompoVehicleType,
} from '../../../shared/sompo-vehicles.js';
import { createSompoVehicle, updateSompoVehicle, SompoVehicleRequestError } from '@/lib/sompo-vehicles-client';

interface SompoVehiclesPanelProps {
  vehicles: SompoVehicle[];
  loading: boolean;
  error: string | null;
  activeId: string;
  onSaved: (vehicle: SompoVehicle) => void;
  onUse: (vehicle: SompoVehicle) => void;
}

type Draft = Pick<SompoVehicle, 'id' | 'veiculo' | 'placa' | 'modelo' | 'modelo3d'> & { dispositivo: string };

const EMPTY_DRAFT: Draft = { id: '', veiculo: 'Trator', placa: '', modelo: '', modelo3d: 'trator-max', dispositivo: '' };
const MODEL_OPTIONS = Object.values(SOMPO_VEHICLE_MODELS_3D);

export function SompoVehicleIcon({ veiculo }: { veiculo: SompoVehicleType }) {
  return veiculo === 'Trator' ? <Tractor aria-hidden="true" /> : <Truck aria-hidden="true" />;
}

/** Cadastro de veículos da conta: lista, cria, edita e escolhe o que vai pro simulador. */
export default function SompoVehiclesPanel({ vehicles, loading, error, activeId, onSaved, onUse }: SompoVehiclesPanelProps) {
  const [editing, setEditing] = useState<{ mode: 'create' | 'edit'; draft: Draft } | null>(null);
  const [fieldError, setFieldError] = useState<{ field: string; message: string } | null>(null);
  const [saving, setSaving] = useState(false);

  function open(mode: 'create' | 'edit', vehicle?: SompoVehicle) {
    setFieldError(null);
    setEditing({
      mode,
      draft: vehicle
        ? { id: vehicle.id, veiculo: vehicle.veiculo, placa: vehicle.placa, modelo: vehicle.modelo, modelo3d: vehicle.modelo3d, dispositivo: vehicle.dispositivo ?? '' }
        : { ...EMPTY_DRAFT },
    });
  }

  function patch(changes: Partial<Draft>) {
    setEditing((current) => (current ? { ...current, draft: { ...current.draft, ...changes } } : current));
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!editing || saving) return;
    // A mesma validação do servidor roda antes, pra apontar o campo sem ida e volta.
    const checked = validateSompoVehicle(editing.draft);
    const model = checked.ok ? checkSompoVehicleModel(editing.draft) : checked;
    if (!model.ok) { setFieldError({ field: model.field, message: model.message }); return; }
    setSaving(true);
    setFieldError(null);
    try {
      const { id, ...changes } = editing.draft;
      const saved = editing.mode === 'create'
        ? await createSompoVehicle(editing.draft)
        : await updateSompoVehicle(id, changes);
      onSaved(saved);
      setEditing(null);
    } catch (err) {
      setFieldError({
        field: err instanceof SompoVehicleRequestError ? err.field || '' : '',
        message: err instanceof Error ? err.message : 'Não foi possível salvar o veículo.',
      });
    } finally {
      setSaving(false);
    }
  }

  const draft = editing?.draft;
  const invalid = (field: string) => (fieldError?.field === field ? true : undefined);

  return (
    <section className="sompo-vehicles" aria-labelledby="sompo-vehicles-title">
      <header className="sompo-vehicles-head">
        <div>
          <h2 id="sompo-vehicles-title">Veículos</h2>
          <p>Cadastro da sua conta. O veículo escolhido decide o modelo 3D e os cases do simulador.</p>
        </div>
        <button type="button" className="sompo-vehicles-add" onClick={() => open('create')} disabled={loading}>
          <Plus aria-hidden="true" /> Novo veículo
        </button>
      </header>

      {error && <p className="sompo-vehicles-error" role="alert">{error}</p>}
      {loading ? (
        <p className="sompo-vehicles-loading" role="status"><Loader2 className="animate-spin" aria-hidden="true" /> Carregando veículos…</p>
      ) : (
        <ul className="sompo-vehicles-list">
          {vehicles.map((vehicle) => (
            <li key={vehicle.id} data-active={vehicle.id === activeId || undefined}>
              <div className="sompo-vehicles-card-title">
                <SompoVehicleIcon veiculo={vehicle.veiculo} />
                <strong>{vehicle.modelo}</strong>
                {vehicle.exemplo && <span className="sompo-vehicles-badge">exemplo</span>}
                {vehicle.id === activeId && <span className="sompo-vehicles-badge" data-tone="active">no simulador</span>}
              </div>
              <dl>
                <div><dt>ID</dt><dd>{vehicle.id}</dd></div>
                <div><dt>Veículo</dt><dd>{vehicle.veiculo}</dd></div>
                <div><dt>Placa</dt><dd>{vehicle.placa}</dd></div>
                <div><dt>Modelo 3D</dt><dd>{SOMPO_VEHICLE_MODELS_3D[vehicle.modelo3d]?.label ?? vehicle.modelo3d}</dd></div>
                <div><dt>Dispositivo</dt><dd data-empty={!vehicle.dispositivo || undefined}>{vehicle.dispositivo ? `ESP32 ${vehicle.dispositivo}` : 'sem dispositivo'}</dd></div>
              </dl>
              <div className="sompo-vehicles-actions">
                <button type="button" onClick={() => onUse(vehicle)}><Play aria-hidden="true" /> Usar no simulador</button>
                <button type="button" onClick={() => open('edit', vehicle)} aria-label={`Editar ${vehicle.id}`}><Pencil aria-hidden="true" /> Editar</button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {editing && draft && (
        <form className="sompo-vehicles-form" onSubmit={save} noValidate aria-label={editing.mode === 'create' ? 'Novo veículo' : `Editar ${draft.id}`}>
          <header>
            <h3>{editing.mode === 'create' ? 'Novo veículo' : `Editar ${draft.id}`}</h3>
            <button type="button" onClick={() => setEditing(null)} aria-label="Fechar formulário"><X aria-hidden="true" /></button>
          </header>
          <label>
            <span>ID</span>
            <input
              name="id" value={draft.id} disabled={editing.mode === 'edit'} aria-invalid={invalid('id')}
              placeholder="trator-0002" autoComplete="off"
              onChange={(event) => patch({ id: event.target.value })}
            />
            {editing.mode === 'edit' && <small>O ID não muda depois de criado.</small>}
          </label>
          <label>
            <span>Veículo</span>
            <select
              name="veiculo" value={draft.veiculo} aria-invalid={invalid('veiculo')}
              onChange={(event) => {
                const veiculo = event.target.value as SompoVehicleType;
                patch({ veiculo, modelo3d: defaultModel3dFor(veiculo) });
              }}
            >
              {SOMPO_VEHICLE_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
            </select>
          </label>
          <label>
            <span>Placa</span>
            <input
              name="placa" value={draft.placa} aria-invalid={invalid('placa')} autoComplete="off"
              placeholder={draft.veiculo === 'Trator' ? 'Placa ou identificação interna (ex. TRT0001)' : 'ABC1D23'}
              onChange={(event) => patch({ placa: event.target.value })}
            />
          </label>
          <label>
            <span>Modelo (cadastro)</span>
            <input
              name="modelo" value={draft.modelo} aria-invalid={invalid('modelo')} autoComplete="off"
              placeholder={draft.veiculo === 'Trator' ? 'John Deere 6110J' : 'Scania R450'}
              onChange={(event) => patch({ modelo: event.target.value })}
            />
          </label>
          <label>
            <span>Modelo 3D</span>
            <select
              name="modelo3d" value={draft.modelo3d} aria-invalid={invalid('modelo3d')}
              onChange={(event) => patch({ modelo3d: event.target.value as SompoVehicleModel3dId })}
            >
              {MODEL_OPTIONS.filter((item) => item.vehicleType === draft.veiculo).map((item) => (
                <option key={item.id} value={item.id}>{item.label}</option>
              ))}
            </select>
          </label>
          <label>
            <span>Dispositivo (ESP32)</span>
            <input
              name="dispositivo" value={draft.dispositivo} aria-invalid={invalid('dispositivo')} autoComplete="off"
              placeholder="ex. 001" aria-describedby="sompo-vehicle-device-hint"
              onChange={(event) => patch({ dispositivo: event.target.value })}
            />
            <small id="sompo-vehicle-device-hint">O ID que o ESP32 publica no feed. Com ele, o modo físico mostra este veículo. Vazio = sem dispositivo.</small>
          </label>
          {fieldError && <p className="sompo-vehicles-error" role="alert">{fieldError.message}</p>}
          <div className="sompo-vehicles-actions">
            <button type="submit" disabled={saving}>
              {saving ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
              {editing.mode === 'create' ? 'Cadastrar' : 'Salvar'}
            </button>
            <button type="button" onClick={() => setEditing(null)}>Cancelar</button>
          </div>
        </form>
      )}
    </section>
  );
}
