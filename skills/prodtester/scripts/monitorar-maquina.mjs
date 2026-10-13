#!/usr/bin/env node
// Amostra, enquanto um teste roda, o uso de CPU do k6 (processo local ou
// contêiner grafana/k6), o uso de CPU da máquina inteira e, se pedido, a
// memória do sistema auditado.
//
// O gerador é considerado saturado quando o k6 usa 90% ou mais dos núcleos
// disponíveis por 20 s ou mais: aí os números da etapa não valem. CPU alta só
// na máquina (k6 e sistema auditado na mesma máquina) vira um alerta.
//
// Uso:
//   node monitorar-maquina.mjs <arquivo-saida.json> [--container <nome>] [--pid <pid>]
//
// Roda até receber SIGTERM ou SIGINT; então grava o resumo e sai.
// --container amostra a memória de um contêiner Docker do sistema auditado.
// --pid amostra a memória (RSS) de um processo do sistema auditado.

import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import os from 'node:os';

const args = process.argv.slice(2);
const saida = args[0];
if (!saida) {
  console.error('uso: node monitorar-maquina.mjs <arquivo-saida.json> [--container <nome>] [--pid <pid>]');
  process.exit(1);
}
const opcao = (nome) => {
  const i = args.indexOf(nome);
  return i >= 0 ? args[i + 1] : null;
};
const container = opcao('--container');
const pid = opcao('--pid');

let nucleosDocker = null;
function cpuGerador() {
  try {
    const pids = execFileSync('pgrep', ['-x', 'k6'], { encoding: 'utf8', timeout: 2000 }).trim().split('\n').filter(Boolean);
    if (pids.length) {
      const total = pids
        .map((p) => Number(execFileSync('ps', ['-o', '%cpu=', '-p', p], { encoding: 'utf8', timeout: 2000 }).trim()))
        .reduce((a, b) => a + b, 0);
      return { pct_de_um_nucleo: total, nucleos: os.cpus().length };
    }
  } catch {
    /* sem k6 local */
  }
  try {
    const id = execFileSync('docker', ['ps', '-q', '--filter', 'ancestor=grafana/k6:2.3.0'], { encoding: 'utf8', timeout: 3000 }).trim().split('\n')[0];
    if (!id) return null;
    if (nucleosDocker === null) nucleosDocker = Number(execFileSync('docker', ['info', '--format', '{{.NCPU}}'], { encoding: 'utf8', timeout: 5000 }).trim()) || os.cpus().length;
    const texto = execFileSync('docker', ['stats', '--no-stream', '--format', '{{.CPUPerc}}', id], { encoding: 'utf8', timeout: 5000 }).trim();
    return { pct_de_um_nucleo: Number(texto.replace('%', '')), nucleos: nucleosDocker };
  } catch {
    return null;
  }
}

const UNIDADES = { b: 1, kib: 1024, mib: 1024 ** 2, gib: 1024 ** 3, kb: 1e3, mb: 1e6, gb: 1e9 };

function memoriaContainer() {
  try {
    const texto = execFileSync('docker', ['stats', '--no-stream', '--format', '{{.MemUsage}}', container], { encoding: 'utf8', timeout: 5000 });
    const m = texto.trim().split('/')[0].trim().match(/^([\d.]+)\s*([a-z]+)$/i);
    return m ? Math.round((Number(m[1]) * (UNIDADES[m[2].toLowerCase()] || 1)) / 1024 ** 2) : null;
  } catch {
    return null;
  }
}

function memoriaProcesso() {
  try {
    const kb = Number(execFileSync('ps', ['-o', 'rss=', '-p', String(pid)], { encoding: 'utf8', timeout: 3000 }).trim());
    return Number.isFinite(kb) ? Math.round(kb / 1024) : null;
  } catch {
    return null;
  }
}

function tempos() {
  return os.cpus().map((c) => {
    const t = c.times;
    return { ocupado: t.user + t.nice + t.sys + t.irq, total: t.user + t.nice + t.sys + t.irq + t.idle };
  });
}

const amostras = [];
let anterior = tempos();
const inicio = Date.now();

const intervalo = setInterval(() => {
  const atual = tempos();
  let ocupado = 0;
  let total = 0;
  atual.forEach((c, i) => {
    ocupado += c.ocupado - anterior[i].ocupado;
    total += c.total - anterior[i].total;
  });
  anterior = atual;
  const amostra = { t_s: Math.round((Date.now() - inicio) / 1000), cpu_pct: total ? Math.round((ocupado / total) * 100) : 0 };
  const gerador = cpuGerador();
  if (gerador) amostra.k6_pct = Math.round(gerador.pct_de_um_nucleo / gerador.nucleos);
  if (container) amostra.memoria_alvo_mb = memoriaContainer();
  if (pid) amostra.memoria_alvo_mb = memoriaProcesso();
  amostras.push(amostra);
}, 2000);

function encerrar() {
  clearInterval(intervalo);
  const cpu = amostras.map((a) => a.cpu_pct);
  const mem = amostras.map((a) => a.memoria_alvo_mb).filter((v) => typeof v === 'number');
  const k6 = amostras.map((a) => a.k6_pct).filter((v) => typeof v === 'number');
  const k6Acima90 = amostras.filter((a) => a.k6_pct >= 90).length * 2;
  const maquinaAcima90 = amostras.filter((a) => a.cpu_pct >= 90).length * 2;
  const resumo = {
    nucleos: os.cpus().length,
    duracao_s: Math.round((Date.now() - inicio) / 1000),
    cpu_media_pct: cpu.length ? Math.round(cpu.reduce((a, b) => a + b, 0) / cpu.length) : null,
    cpu_max_pct: cpu.length ? Math.max(...cpu) : null,
    k6_cpu_max_pct: k6.length ? Math.max(...k6) : null,
    k6_medido: k6.length > 0,
    segundos_k6_acima_90_pct: k6Acima90,
    segundos_maquina_acima_90_pct: maquinaAcima90,
    gerador_saturado: k6Acima90 >= 20,
    maquina_saturada: maquinaAcima90 >= 20,
    memoria_alvo_mb: mem.length ? { inicio: mem[0], max: Math.max(...mem), fim: mem[mem.length - 1] } : null,
    amostras,
  };
  writeFileSync(saida, `${JSON.stringify(resumo, null, 2)}\n`);
  process.exit(0);
}

process.on('SIGTERM', encerrar);
process.on('SIGINT', encerrar);
