#!/usr/bin/env node
// Palco ao vivo: mostra as falas das personas no terminal, enquanto elas navegam.
//
// Uso:
//   node palco.mjs                     acompanha a última auditoria (auditoria/ultima.txt)
//   node palco.mjs <pasta-execucao>    acompanha uma execução específica
//   node palco.mjs <pasta> --replay    reapresenta uma execução já terminada
//   node palco.mjs <pasta> --replay 2  reapresenta com o dobro da velocidade
//
// Ctrl+C encerra.

import { existsSync, openSync, readFileSync, readSync, statSync, closeSync } from 'node:fs';
import { join, resolve } from 'node:path';

const args = process.argv.slice(2);
const replay = args.includes('--replay');
const indiceReplay = args.indexOf('--replay');
const velocidade = replay && Number(args[indiceReplay + 1]) > 0 ? Number(args[indiceReplay + 1]) : 1;
const posicionais = args.filter((a, i) => !a.startsWith('--') && !(replay && i === indiceReplay + 1));

function pastaDaExecucao() {
  if (posicionais[0]) return resolve(posicionais[0]);
  const ultima = join('auditoria', 'ultima.txt');
  if (!existsSync(ultima)) {
    console.error('palco: nenhuma auditoria encontrada. Informe a pasta da execução.');
    process.exit(1);
  }
  return resolve('auditoria', readFileSync(ultima, 'utf8').trim());
}

const pasta = pastaDaExecucao();
const arquivo = join(pasta, 'narrativa.jsonl');

const cor = process.stdout.isTTY && !process.env.NO_COLOR;
const ANSI = {
  reset: '\x1b[0m', negrito: '\x1b[1m', fraco: '\x1b[2m', italico: '\x1b[3m',
  red: '\x1b[31m', green: '\x1b[32m', yellow: '\x1b[33m', blue: '\x1b[34m',
  magenta: '\x1b[35m', cyan: '\x1b[36m', white: '\x1b[37m', gray: '\x1b[90m',
};
const pinta = (codigos, texto) => (cor ? `${codigos.map((c) => ANSI[c] ?? '').join('')}${texto}${ANSI.reset}` : texto);

const MARCAS = {
  inicio: { simbolo: '▶', estilo: ['negrito'] },
  acao: { simbolo: '·', estilo: [] },
  pensamento: { simbolo: '💭', estilo: ['italico'] },
  problema: { simbolo: '⚠', estilo: ['red', 'negrito'] },
  abandono: { simbolo: '✖', estilo: ['red'] },
  sucesso: { simbolo: '✔', estilo: ['green', 'negrito'] },
  fim: { simbolo: '■', estilo: ['fraco'] },
};

const contagem = { falas: 0, problemas: 0, sucessos: 0, abandonos: 0 };
const largura = 14;

function hora(iso) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '--:--:--' : d.toTimeString().slice(0, 8);
}

function mostrar(fala) {
  const marca = MARCAS[fala.tipo] ?? MARCAS.acao;
  const nome = `${fala.nome ?? fala.persona}`.padEnd(largura).slice(0, largura);
  const prefixo = `${pinta(['gray'], hora(fala.t))}  ${fala.emoji ?? '🙂'} ${pinta([fala.cor ?? 'white', 'negrito'], nome)}${pinta(['gray'], '›')} `;
  const texto = pinta(marca.estilo, `${marca.simbolo === '·' ? '' : `${marca.simbolo} `}${fala.texto}`);
  console.log(prefixo + texto);
  contagem.falas += 1;
  if (fala.tipo === 'problema') contagem.problemas += 1;
  if (fala.tipo === 'sucesso') contagem.sucessos += 1;
  if (fala.tipo === 'abandono') contagem.abandonos += 1;
}

function cabecalho() {
  const titulo = ' prodtester · palco ao vivo ';
  const linha = '━'.repeat(Math.max(10, Math.min(process.stdout.columns || 80, 80) - titulo.length - 2));
  console.log(`\n${pinta(['magenta', 'negrito'], `━━${titulo}${linha}`)}`);
  console.log(pinta(['gray'], `  ${pasta}${replay ? `  ·  replay ${velocidade}×` : ''}\n`));
}

function rodape() {
  console.log(
    `\n${pinta(['gray'], '━━')} ${contagem.falas} falas · ${pinta(['red'], `${contagem.problemas} problemas`)} · ${pinta(['green'], `${contagem.sucessos} sucessos`)} · ${contagem.abandonos} abandonos\n`,
  );
}

function interpretar(linha) {
  try {
    return JSON.parse(linha);
  } catch {
    return null;
  }
}

const espera = (ms) => new Promise((r) => setTimeout(r, ms));

async function reapresentar() {
  if (!existsSync(arquivo)) {
    console.error(`palco: ${arquivo} não existe.`);
    process.exit(1);
  }
  const falas = readFileSync(arquivo, 'utf8').split('\n').map(interpretar).filter(Boolean);
  let anterior = null;
  for (const fala of falas) {
    if (anterior) {
      const intervalo = new Date(fala.t) - new Date(anterior.t);
      await espera(Math.min(Math.max(intervalo, 250), 1800) / velocidade);
    }
    mostrar(fala);
    anterior = fala;
  }
  rodape();
}

async function acompanhar() {
  let posicao = 0;
  let resto = '';
  let avisou = false;
  for (;;) {
    if (existsSync(arquivo)) {
      const tamanho = statSync(arquivo).size;
      if (tamanho < posicao) posicao = 0;
      if (tamanho > posicao) {
        const fd = openSync(arquivo, 'r');
        const buffer = Buffer.alloc(tamanho - posicao);
        readSync(fd, buffer, 0, buffer.length, posicao);
        closeSync(fd);
        posicao = tamanho;
        const partes = (resto + buffer.toString('utf8')).split('\n');
        resto = partes.pop();
        for (const linha of partes) {
          const fala = interpretar(linha);
          if (fala) mostrar(fala);
        }
      }
    } else if (!avisou) {
      console.log(pinta(['gray'], '  Aguardando as personas entrarem em cena…\n'));
      avisou = true;
    }
    await espera(200);
  }
}

process.on('SIGINT', () => {
  rodape();
  process.exit(0);
});

cabecalho();
if (replay) await reapresentar();
else await acompanhar();
