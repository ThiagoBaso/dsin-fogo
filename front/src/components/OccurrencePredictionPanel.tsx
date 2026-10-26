import type { PrevisaoOcorrencias, PrevisaoOcorrenciaArea } from '../types';

function formatCount(value: number) {
  return value.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 2 });
}

function formatProbability(value: number) {
  return `${(value * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`;
}

function formatHourRange(start: string, end: string) {
  const startDate = new Date(start);
  const endDate = new Date(end);
  const hour = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' });
  const startTime = hour.format(startDate);
  const endTime = hour.format(endDate);
  const crossesDay = startDate.toDateString() !== endDate.toDateString();
  return `${startTime}–${endTime}${crossesDay ? ' (+1 dia)' : ''}`;
}

function ForecastIntervals({ area }: { area: PrevisaoOcorrenciaArea }) {
  const maximumCount = Math.max(0.01, ...area.intervalos.map((interval) => interval.quantidade_esperada));
  const maximumProbability = Math.max(0.01, ...area.intervalos.map((interval) => interval.probabilidade_grave));

  return (
    <section className="forecast-chart" aria-label="Previs&#227;o por faixa de seis horas">
      <div className="forecast-section-heading">
        <h3>Pr&#243;ximas 24 h por faixa</h3>
        <span>Quantidade e chance grave</span>
      </div>
      <div className="forecast-interval-grid">
        {area.intervalos.map((interval) => (
          <article className="forecast-interval-card" key={interval.inicio}>
            <h4>{formatHourRange(interval.inicio, interval.fim)}</h4>
            <div className="forecast-interval-metrics">
              <div>
                <span>Esperadas</span>
                <strong className="is-quantity">{formatCount(interval.quantidade_esperada)}</strong>
                <span className="forecast-chart-track" aria-hidden="true">
                  <span
                    className="forecast-chart-fill is-quantity"
                    style={{ width: `${Math.min(100, interval.quantidade_esperada / maximumCount * 100)}%` }}
                  />
                </span>
              </div>
              <div>
                <span>Chance grave</span>
                <strong className="is-serious">{formatProbability(interval.probabilidade_grave)}</strong>
                <span className="forecast-chart-track" aria-hidden="true">
                  <span
                    className="forecast-chart-fill is-serious"
                    style={{ width: `${Math.min(100, interval.probabilidade_grave / maximumProbability * 100)}%` }}
                  />
                </span>
              </div>
            </div>
            <small>{interval.janelas_com_graves}/{interval.janelas_avaliadas} janelas com ocorr&#234;ncia grave</small>
          </article>
        ))}
      </div>
    </section>
  );
}

type BacktestPoint = NonNullable<PrevisaoOcorrencias['avaliacao']>['series_por_area'][number]['pontos'][number];

type BacktestMonth = {
  key: string;
  label: string;
  inicio: string;
  fim: string;
  previsto: number;
  observado: number;
};

function BacktestChart({ points }: { points: BacktestPoint[] }) {
  const monthlyPoints: BacktestMonth[] = [];
  points.forEach((point) => {
    const date = new Date(point.data);
    const key = `${date.getFullYear()}-${date.getMonth()}`;
    let month = monthlyPoints[monthlyPoints.length - 1];
    if (!month || month.key !== key) {
      const label = new Intl.DateTimeFormat('pt-BR', { month: 'short', year: '2-digit' })
        .format(date)
        .replace('. de ', '/')
        .replace('.', '');
      month = { key, label, inicio: point.data, fim: point.data, previsto: 0, observado: 0 };
      monthlyPoints.push(month);
    }
    month.fim = point.data;
    month.previsto += point.previsto;
    month.observado += point.observado;
  });
  if (monthlyPoints.length < 2) return null;

  const width = 480;
  const height = 176;
  const left = 38;
  const right = 10;
  const top = 10;
  const bottom = 28;
  const plotWidth = width - left - right;
  const plotHeight = height - top - bottom;
  const maximum = Math.max(1, ...monthlyPoints.flatMap((point) => [point.previsto, point.observado]));
  const x = (index: number) => left + index / (monthlyPoints.length - 1) * plotWidth;
  const y = (value: number) => top + (1 - value / maximum) * plotHeight;
  const line = (getValue: (point: BacktestMonth) => number) => monthlyPoints
    .map((point, index) => `${index === 0 ? 'M' : 'L'} ${x(index).toFixed(1)} ${y(getValue(point)).toFixed(1)}`)
    .join(' ');
  const formatTick = (value: number) => value.toLocaleString('pt-BR', { maximumFractionDigits: 1 });
  const formatDate = (value: string) => new Date(value).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });

  return (
    <figure className="forecast-backtest-chart">
      <figcaption>Previsto x observado &middot; totais mensais</figcaption>
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Totais mensais previstos e observados nos &uacute;ltimos seis meses">
        {[0, 0.5, 1].map((step) => {
          const value = maximum * (1 - step);
          const lineY = top + step * plotHeight;
          return (
            <g key={step}>
              <line className="forecast-backtest-gridline" x1={left} x2={width - right} y1={lineY} y2={lineY} />
              <text className="forecast-backtest-axis-label" x={left - 5} y={lineY + 3} textAnchor="end">{formatTick(value)}</text>
            </g>
          );
        })}
        <path className="forecast-backtest-line is-predicted" d={line((point) => point.previsto)} />
        <path className="forecast-backtest-line is-observed" d={line((point) => point.observado)} />
        {monthlyPoints.map((point, index) => (
          <g key={point.key}>
            <circle className="forecast-backtest-point is-predicted" cx={x(index)} cy={y(point.previsto)} r="3">
              <title>{`${point.label} (${formatDate(point.inicio)}\u2013${formatDate(point.fim)}): previsto ${formatCount(point.previsto)}`}</title>
            </circle>
            <circle className="forecast-backtest-point is-observed" cx={x(index)} cy={y(point.observado)} r="3">
              <title>{`${point.label} (${formatDate(point.inicio)}\u2013${formatDate(point.fim)}): observado ${point.observado}`}</title>
            </circle>
            <text
              className="forecast-backtest-axis-label"
              x={x(index)}
              y={height - 6}
              textAnchor={index === 0 ? 'start' : index === monthlyPoints.length - 1 ? 'end' : 'middle'}
            >
              {point.label}
            </text>
          </g>
        ))}
      </svg>
      <div className="forecast-backtest-legend" aria-label="Legenda do gr&#225;fico">
        <span><i className="is-predicted" /> Previsto</span>
        <span><i className="is-observed" /> Observado</span>
      </div>
    </figure>
  );
}

function BacktestSummary({ forecast, areaId }: { forecast: PrevisaoOcorrencias; areaId: number }) {
  const evaluation = forecast.avaliacao;
  if (!evaluation) return null;
  const selectedSeries = evaluation.series_por_area.find((item) => item.area_id === areaId);

  const quantityBetter = evaluation.mae_modelo <= evaluation.mae_referencia;
  const probabilityBetter = evaluation.brier_modelo <= evaluation.brier_referencia;

  return (
    <section className="forecast-backtest" aria-label="Validação retrospectiva da previsão">
      <h3>Validação retrospectiva · últimos {evaluation.meses_teste} meses completos</h3>
      <p>
        {evaluation.amostras.toLocaleString('pt-BR')} comparações de área e dia, simulando previsões feitas antes dos resultados.
      </p>
      <ul className="forecast-backtest-metrics">
        <li>
          <span>Erro médio da quantidade (MAE)</span>
          <strong>{formatCount(evaluation.mae_modelo)}</strong>
          <small>
            Base vizinha: {formatCount(evaluation.mae_referencia)} · {quantityBetter ? 'modelo melhor' : 'base melhor'}
          </small>
        </li>
        <li>
          <span>Erro da probabilidade grave (Brier)</span>
          <strong>{evaluation.brier_modelo.toLocaleString('pt-BR', { maximumFractionDigits: 3 })}</strong>
          <small>
            Base vizinha: {evaluation.brier_referencia.toLocaleString('pt-BR', { maximumFractionDigits: 3 })}
            {' '}· {probabilityBetter ? 'modelo melhor' : 'base melhor'}
          </small>
        </li>
      </ul>
      {selectedSeries && <BacktestChart points={selectedSeries.pontos} />}
    </section>
  );
}

export default function OccurrencePredictionPanel({
  forecast,
  selectedAreaId,
  onSelectArea,
  loading,
  error,
}: {
  forecast: PrevisaoOcorrencias | null;
  selectedAreaId: number | null;
  onSelectArea: (areaId: number) => void;
  loading: boolean;
  error: string;
}) {
  if (loading) {
    return <section className="occurrence-prediction" aria-label="Previsão de ocorrências"><p role="status">Calculando previsão…</p></section>;
  }
  if (error) {
    return <section className="occurrence-prediction" aria-label="Previsão de ocorrências"><p role="alert">{error}</p></section>;
  }
  if (!forecast || forecast.status !== 'ok' || forecast.areas.length === 0) {
    return (
      <section className="occurrence-prediction" aria-label="Previsão de ocorrências">
        <h2>Previsão por área agrupada</h2>
        <p>Não há histórico suficiente para estimar as próximas 24 horas.</p>
      </section>
    );
  }

  const area = forecast.areas.find((item) => item.id === selectedAreaId)
    || [...forecast.areas].sort((left, right) => right.probabilidade_grave_24h - left.probabilidade_grave_24h)[0];

  return (
    <section className="occurrence-prediction" aria-label="Previsão de ocorrências">
      <header className="occurrence-prediction-heading">
        <h2>Previsão por área agrupada</h2>
        <p>Próximas 24 h · {forecast.ocorrencias_historicas.toLocaleString('pt-BR')} ocorrências · {forecast.periodo_historico_semanas} semanas comparáveis</p>
      </header>
      <label className="forecast-region-select">
        <span>Área destacada no mapa</span>
        <select
          value={area.id}
          onChange={(event) => onSelectArea(Number(event.target.value))}
        >
          {forecast.areas.map((item) => <option key={item.id} value={item.id}>{item.nome}</option>)}
        </select>
      </label>
      <div className="forecast-region-summary">
        <p>{area.nome} · {area.quantidade_setores} setores censitários</p>
        <div className="forecast-summary-metrics">
          <div>
            <span>Ocorrências esperadas</span>
            <strong>{formatCount(area.quantidade_esperada)}</strong>
            <small>Faixa histórica P10–P90: {area.faixa_historica_p10}–{area.faixa_historica_p90}</small>
          </div>
          <div>
            <span>Chance de ocorrência grave</span>
            <strong>{formatProbability(area.probabilidade_grave_24h)}</strong>
            <small>Alta ou crítica em pelo menos um setor, nas próximas 24 h</small>
          </div>
        </div>
      </div>
      <ForecastIntervals area={area} />
      <p className="forecast-demo-note">Dados sintéticos; a estimativa demonstra o método e não representa risco real da cidade.</p>
      <details className="forecast-method-details">
        <summary>Detalhes do histórico e das faixas</summary>
        <p>{forecast.metodo}</p>
        <ul>
          {area.intervalos.map((interval) => (
            <li key={interval.inicio}>
              {formatHourRange(interval.inicio, interval.fim)}: quantidade P10–P90 {interval.faixa_historica_p10}–{interval.faixa_historica_p90}; ocorrência grave em {interval.janelas_com_graves} de {interval.janelas_avaliadas} janelas; amostra efetiva de {Math.round(interval.janelas_efetivas)}.
            </li>
          ))}
        </ul>
      </details>
      <BacktestSummary forecast={forecast} areaId={area.id} />
    </section>
  );
}
