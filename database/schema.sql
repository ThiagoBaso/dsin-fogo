-- F.O.G.O. reference schema for MySQL 8.0 / InnoDB.
-- This file creates structures only; it does not drop existing data.
CREATE DATABASE IF NOT EXISTS fogo CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
USE fogo;

CREATE TABLE IF NOT EXISTS orgaos (
  id_orgao INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  nome VARCHAR(150) NOT NULL,
  sigla VARCHAR(25),
  esfera VARCHAR(30),
  UNIQUE KEY uq_orgaos_nome (nome)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS regioes (
  id_regiao INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  nome VARCHAR(100) NOT NULL UNIQUE,
  descricao TEXT
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS bairros (
  id_bairro INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  id_regiao INT UNSIGNED NOT NULL,
  nome VARCHAR(120) NOT NULL,
  UNIQUE KEY uq_bairros_regiao_nome (id_regiao, nome),
  CONSTRAINT fk_bairros_regiao FOREIGN KEY (id_regiao) REFERENCES regioes(id_regiao)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS localizacoes (
  id_localizacao INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  id_bairro INT UNSIGNED NOT NULL,
  cep CHAR(8),
  cidade VARCHAR(100) NOT NULL,
  uf CHAR(2) NOT NULL,
  logradouro VARCHAR(180),
  referencia VARCHAR(255),
  latitude DECIMAL(10,7) NOT NULL,
  longitude DECIMAL(10,7) NOT NULL,
  KEY ix_localizacoes_bairro (id_bairro),
  KEY ix_localizacoes_coord (latitude, longitude),
  CONSTRAINT fk_localizacoes_bairro FOREIGN KEY (id_bairro) REFERENCES bairros(id_bairro),
  CONSTRAINT chk_localizacoes_lat CHECK (latitude BETWEEN -90 AND 90),
  CONSTRAINT chk_localizacoes_lon CHECK (longitude BETWEEN -180 AND 180)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS tipos_equipamento (
  id_tipo INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  nome VARCHAR(100) NOT NULL UNIQUE,
  mobilidade ENUM('fixo','movel') NOT NULL,
  icone_mapa VARCHAR(80)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS situacoes_equipamento (
  id_situacao INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  nome VARCHAR(80) NOT NULL UNIQUE,
  disponivel BOOLEAN NOT NULL DEFAULT FALSE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS equipamentos (
  id_equipamento INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  id_tipo INT UNSIGNED NOT NULL,
  id_orgao INT UNSIGNED NOT NULL,
  id_localizacao INT UNSIGNED,
  id_situacao INT UNSIGNED NOT NULL,
  numero_serie VARCHAR(120) NOT NULL UNIQUE,
  marca VARCHAR(100) NOT NULL,
  modelo VARCHAR(100) NOT NULL,
  cadastrado_em DATETIME NOT NULL,
  instalado_em DATETIME,
  KEY ix_equip_tipo_situacao (id_tipo, id_situacao),
  KEY ix_equip_orgao_situacao (id_orgao, id_situacao),
  KEY ix_equip_localizacao (id_localizacao),
  CONSTRAINT fk_equip_tipo FOREIGN KEY (id_tipo) REFERENCES tipos_equipamento(id_tipo),
  CONSTRAINT fk_equip_orgao FOREIGN KEY (id_orgao) REFERENCES orgaos(id_orgao),
  CONSTRAINT fk_equip_local FOREIGN KEY (id_localizacao) REFERENCES localizacoes(id_localizacao),
  CONSTRAINT fk_equip_situacao FOREIGN KEY (id_situacao) REFERENCES situacoes_equipamento(id_situacao)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS atributos_tipo (
  id_atributo INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  id_tipo INT UNSIGNED NOT NULL,
  nome VARCHAR(100) NOT NULL,
  tipo_valor ENUM('texto','numero','booleano') NOT NULL,
  unidade VARCHAR(30),
  obrigatorio BOOLEAN NOT NULL DEFAULT FALSE,
  UNIQUE KEY uq_atributos_tipo_nome (id_tipo, nome),
  CONSTRAINT fk_atributos_tipo FOREIGN KEY (id_tipo) REFERENCES tipos_equipamento(id_tipo)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS valores_atributo (
  id_equipamento INT UNSIGNED NOT NULL,
  id_atributo INT UNSIGNED NOT NULL,
  valor_texto VARCHAR(255),
  valor_numero DECIMAL(14,4),
  valor_booleano BOOLEAN,
  PRIMARY KEY (id_equipamento, id_atributo),
  CONSTRAINT fk_valores_equip FOREIGN KEY (id_equipamento) REFERENCES equipamentos(id_equipamento),
  CONSTRAINT fk_valores_atributo FOREIGN KEY (id_atributo) REFERENCES atributos_tipo(id_atributo),
  CONSTRAINT chk_valores_uma_coluna CHECK ((valor_texto IS NOT NULL) + (valor_numero IS NOT NULL) + (valor_booleano IS NOT NULL) = 1)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS historico_situacoes (
  id_historico INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  id_equipamento INT UNSIGNED NOT NULL,
  id_situacao INT UNSIGNED NOT NULL,
  iniciado_em DATETIME NOT NULL,
  encerrado_em DATETIME,
  observacao TEXT,
  KEY ix_hist_equip_tempo (id_equipamento, iniciado_em),
  CONSTRAINT fk_hist_equip FOREIGN KEY (id_equipamento) REFERENCES equipamentos(id_equipamento),
  CONSTRAINT fk_hist_situacao FOREIGN KEY (id_situacao) REFERENCES situacoes_equipamento(id_situacao),
  CONSTRAINT chk_hist_periodo CHECK (encerrado_em IS NULL OR encerrado_em >= iniciado_em)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS manutencoes (
  id_manutencao INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  id_equipamento INT UNSIGNED NOT NULL,
  modalidade ENUM('preventiva','corretiva') NOT NULL,
  prioridade ENUM('imediata','agendada') NOT NULL,
  status ENUM('pendente','agendada','em_execucao','concluida','cancelada') NOT NULL,
  descricao TEXT,
  aberta_em DATETIME NOT NULL,
  prevista_para DATETIME,
  iniciada_em DATETIME,
  concluida_em DATETIME,
  KEY ix_manut_equip_status_prev (id_equipamento, status, prevista_para),
  CONSTRAINT fk_manut_equip FOREIGN KEY (id_equipamento) REFERENCES equipamentos(id_equipamento),
  CONSTRAINT chk_manut_periodo CHECK (concluida_em IS NULL OR iniciada_em IS NULL OR concluida_em >= iniciada_em)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS agentes (
  id_agente INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  id_orgao INT UNSIGNED NOT NULL,
  id_localizacao_base INT UNSIGNED,
  matricula VARCHAR(60) NOT NULL,
  nome VARCHAR(150) NOT NULL,
  cargo VARCHAR(100) NOT NULL,
  ativo_cadastro BOOLEAN NOT NULL DEFAULT TRUE,
  raio_atuacao_km DECIMAL(5,2),
  UNIQUE KEY uq_agente_orgao_matricula (id_orgao, matricula),
  CONSTRAINT fk_agente_orgao FOREIGN KEY (id_orgao) REFERENCES orgaos(id_orgao),
  CONSTRAINT fk_agente_base FOREIGN KEY (id_localizacao_base) REFERENCES localizacoes(id_localizacao),
  CONSTRAINT chk_agente_raio_atuacao CHECK (raio_atuacao_km IS NULL OR raio_atuacao_km BETWEEN 0.10 AND 25.00)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS turnos_agente (
  id_turno INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  id_agente INT UNSIGNED NOT NULL,
  id_equipamento INT UNSIGNED,
  id_regiao INT UNSIGNED NOT NULL,
  inicio_previsto DATETIME NOT NULL,
  fim_previsto DATETIME NOT NULL,
  inicio_real DATETIME,
  fim_real DATETIME,
  status ENUM('programado','em_atividade','encerrado') NOT NULL,
  KEY ix_turno_agente_inicio (id_agente, inicio_previsto),
  KEY ix_turno_regiao_inicio (id_regiao, inicio_previsto),
  KEY ix_turno_equipamento_status_inicio (id_equipamento, status, inicio_previsto),
  CONSTRAINT fk_turno_agente FOREIGN KEY (id_agente) REFERENCES agentes(id_agente),
  CONSTRAINT fk_turno_equipamento FOREIGN KEY (id_equipamento) REFERENCES equipamentos(id_equipamento),
  CONSTRAINT fk_turno_regiao FOREIGN KEY (id_regiao) REFERENCES regioes(id_regiao),
  CONSTRAINT chk_turno_periodo CHECK (fim_previsto > inicio_previsto),
  CONSTRAINT chk_turno_veiculo CHECK (status = 'encerrado' OR id_equipamento IS NOT NULL)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS viagens (
  id_viagem INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  id_equipamento INT UNSIGNED NOT NULL,
  inicio_em DATETIME NOT NULL,
  fim_em DATETIME,
  distancia_m DECIMAL(12,2) NOT NULL,
  situacao ENUM('em_andamento','concluida','interrompida') NOT NULL DEFAULT 'concluida',
  KEY ix_viagem_equip_inicio (id_equipamento, inicio_em),
  KEY ix_viagem_equip_situacao_inicio (id_equipamento, situacao, inicio_em),
  CONSTRAINT fk_viagem_equip FOREIGN KEY (id_equipamento) REFERENCES equipamentos(id_equipamento),
  CONSTRAINT chk_viagem_periodo CHECK (
    (situacao = 'em_andamento' AND fim_em IS NULL)
    OR (situacao <> 'em_andamento' AND fim_em IS NOT NULL AND fim_em > inicio_em)
  ),
  CONSTRAINT chk_viagem_dist CHECK (distancia_m >= 0)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS posicoes_equipamento (
  id_posicao BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  id_equipamento INT UNSIGNED NOT NULL,
  id_viagem INT UNSIGNED,
  latitude DECIMAL(10,7) NOT NULL,
  longitude DECIMAL(10,7) NOT NULL,
  velocidade_kmh DECIMAL(6,2),
  registrado_em DATETIME NOT NULL,
  KEY ix_pos_equip_tempo (id_equipamento, registrado_em),
  KEY ix_pos_viagem_tempo (id_viagem, registrado_em),
  UNIQUE KEY uq_pos_viagem_tempo (id_viagem, registrado_em),
  CONSTRAINT fk_pos_equip FOREIGN KEY (id_equipamento) REFERENCES equipamentos(id_equipamento),
  CONSTRAINT fk_pos_viagem FOREIGN KEY (id_viagem) REFERENCES viagens(id_viagem),
  CONSTRAINT chk_pos_lat CHECK (latitude BETWEEN -90 AND 90),
  CONSTRAINT chk_pos_lon CHECK (longitude BETWEEN -180 AND 180)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS posicoes_agente (
  id_posicao BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  id_agente INT UNSIGNED NOT NULL,
  latitude DECIMAL(10,7) NOT NULL,
  longitude DECIMAL(10,7) NOT NULL,
  registrado_em DATETIME NOT NULL,
  KEY ix_pos_agente_tempo (id_agente, registrado_em),
  CONSTRAINT fk_pos_agente FOREIGN KEY (id_agente) REFERENCES agentes(id_agente),
  CONSTRAINT chk_pos_agente_lat CHECK (latitude BETWEEN -90 AND 90),
  CONSTRAINT chk_pos_agente_lon CHECK (longitude BETWEEN -180 AND 180)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS ocorrencias (
  id_ocorrencia INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  id_localizacao INT UNSIGNED NOT NULL,
  id_orgao INT UNSIGNED NOT NULL,
  id_equipamento INT UNSIGNED,
  tipo VARCHAR(100) NOT NULL,
  gravidade ENUM('baixa','media','alta','critica') NOT NULL,
  status ENUM('aberta','em_atendimento','resolvida','cancelada') NOT NULL,
  descricao TEXT,
  ocorrida_em DATETIME NOT NULL,
  KEY ix_ocorr_local_tempo (id_localizacao, ocorrida_em),
  KEY ix_ocorr_tempo_tipo (ocorrida_em, tipo),
  CONSTRAINT fk_ocorr_local FOREIGN KEY (id_localizacao) REFERENCES localizacoes(id_localizacao),
  CONSTRAINT fk_ocorr_orgao FOREIGN KEY (id_orgao) REFERENCES orgaos(id_orgao),
  CONSTRAINT fk_ocorr_equip FOREIGN KEY (id_equipamento) REFERENCES equipamentos(id_equipamento)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS alertas (
  id_alerta INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  id_equipamento INT UNSIGNED,
  id_agente INT UNSIGNED,
  id_ocorrencia INT UNSIGNED,
  id_regiao INT UNSIGNED,
  categoria VARCHAR(80) NOT NULL,
  severidade ENUM('baixa','media','alta','critica') NOT NULL,
  mensagem TEXT NOT NULL,
  criado_em DATETIME NOT NULL,
  resolvido_em DATETIME,
  KEY ix_alerta_tempo (criado_em),
  CONSTRAINT fk_alerta_equip FOREIGN KEY (id_equipamento) REFERENCES equipamentos(id_equipamento),
  CONSTRAINT fk_alerta_agente FOREIGN KEY (id_agente) REFERENCES agentes(id_agente),
  CONSTRAINT fk_alerta_ocorr FOREIGN KEY (id_ocorrencia) REFERENCES ocorrencias(id_ocorrencia),
  CONSTRAINT fk_alerta_regiao FOREIGN KEY (id_regiao) REFERENCES regioes(id_regiao),
  CONSTRAINT chk_alerta_alvo CHECK (id_equipamento IS NOT NULL OR id_agente IS NOT NULL OR id_ocorrencia IS NOT NULL OR id_regiao IS NOT NULL)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS previsoes_risco (
  id_previsao INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  id_regiao INT UNSIGNED NOT NULL,
  janela_inicio DATETIME NOT NULL,
  janela_fim DATETIME NOT NULL,
  indice_risco DECIMAL(5,2) NOT NULL,
  nivel_risco ENUM('baixo','medio','alto','critico') NOT NULL,
  metodo VARCHAR(100) NOT NULL,
  gerada_em DATETIME NOT NULL,
  KEY ix_previsao_regiao_janela (id_regiao, janela_inicio, janela_fim),
  CONSTRAINT fk_previsao_regiao FOREIGN KEY (id_regiao) REFERENCES regioes(id_regiao),
  CONSTRAINT chk_previsao_indice CHECK (indice_risco BETWEEN 0 AND 100),
  CONSTRAINT chk_previsao_periodo CHECK (janela_fim > janela_inicio)
) ENGINE=InnoDB;
