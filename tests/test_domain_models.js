import { FisherModel } from '../src/domain/FisherModel.js';
import { DebtTrajectoryModel } from '../src/domain/DebtTrajectoryModel.js';
import { SensibilityMatrixModel } from '../src/domain/SensibilityMatrixModel.js';
import { DebtStabilizationModel } from '../src/domain/DebtStabilizationModel.js';
import { MiseryIndexModel } from '../src/domain/MiseryIndexModel.js';
import { ParametrosVendor } from '../src/infrastructure/ParametrosVendor.js';
import { CsvExporter } from '../src/infrastructure/CsvExporter.js';
import { MacroState } from '../src/domain/MacroState.js';
import { PublicFinanceModel } from '../src/domain/PublicFinanceModel.js';
import { UnionSpendingModel } from '../src/domain/UnionSpendingModel.js';
import { UnionBudgetModel } from '../src/domain/UnionBudgetModel.js';
import { MacroObservatoryService } from '../src/application/MacroObservatoryService.js';
import { GovApiGateway } from '../src/infrastructure/GovApiGateway.js';
import { LocalSnapshotStore } from '../src/infrastructure/LocalSnapshotStore.js';
import { PreferenciasStore } from '../src/infrastructure/PreferenciasStore.js';
import { CenarioUrl } from '../src/ui/CenarioUrl.js';

/**
 * Suite de Testes Unitários: Modelos Econômicos e Matemáticos
 */
let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  [PASS] ${message}`);
    passed++;
  } else {
    console.error(`  [FAIL] ${message}`);
    failed++;
  }
}

function assertCloseTo(actual, expected, tolerance = 0.05, message) {
  const diff = Math.abs(actual - expected);
  assert(diff <= tolerance, `${message} (Obtido: ${actual}, Esperado: ${expected}, Dif: ${diff.toFixed(4)})`);
}

console.log('--- Executando Testes de Domínio: Observatório Macroeconômico ---');

// 1. Teste da Equação de Fisher
console.log('\n1. Teste da Equação de Fisher (Juro Real Implícito)');
const realRate = FisherModel.calculateRealRate(10.50, 4.90);
assertCloseTo(realRate, 5.3384, 0.01, 'Juro Real para Selic 10.5% e IPCA 4.9% deve ser ~5,34%');

const realRateZero = FisherModel.calculateRealRate(5.0, 5.0);
assertCloseTo(realRateZero, 0.0, 0.001, 'Juro Real com Selic == IPCA deve ser 0%');

// 2. Teste da Trajetória da Dívida Pública
console.log('\n2. Teste do Modelo de Trajetória da Dívida (FMI / Tesouro)');
const fiscalSim = DebtTrajectoryModel.simulate({
  dbggBase: 78.50,
  pibBaseTri: 12.70,
  growth: 2.0,
  selic: 10.50,
  ipca: 4.90,
  taxRate: 34.20,
  spendVariation: 0.0,
  custoSelicPontoBi: 50.0,
  jurosBaseBi: 500,
  selicReferencia: 10.50,
  gruposOrcamento: [
    { chave: 'previdencia', rotulo: 'Previdência', bi: 1000 },
    { chave: 'juros', rotulo: 'Juros', bi: 500 },
    { chave: 'amortizacao', rotulo: 'Amortização', bi: 300 }
  ],
  horizon: 5
});
assert(fiscalSim.trajectory.length === 5, 'Trajetória deve conter 5 anos projetados');
assert(fiscalSim.trajectory[0] > 70 && fiscalSim.trajectory[0] < 90, 'Dívida no Ano 1 deve estar na faixa razoável (70% - 90%)');
assert(fiscalSim.custoJurosBi === 500, 'Na Selic oficial, os juros do simulador são os pagos de fato (R$ 500 Bi)');
const comp = Object.fromEntries(fiscalSim.composicao.map(g => [g.chave, g.bi]));
assert(comp.previdencia === 1000 && comp.juros === 500 && comp.amortizacao === 300, 'Rosca do simulador usa a composição real da despesa');
const fiscalAperto = DebtTrajectoryModel.simulate({ dbggBase: 78.5, pibBaseTri: 12.7, growth: 2, selic: 11.5, ipca: 4.9, taxRate: 34.2, spendVariation: -10, jurosBaseBi: 500, selicReferencia: 10.5, gruposOrcamento: fiscalSim.composicao });
const compAperto = Object.fromEntries(fiscalAperto.composicao.map(g => [g.chave, g.bi]));
assert(compAperto.juros === 550 && compAperto.previdencia === 900 && compAperto.amortizacao === 300, 'Selic +1 pp soma R$ 50 Bi aos juros; corte de 10% só atinge o gasto primário');

// 3. Teste da Matriz de Sensibilidade do Tesouro
console.log('\n3. Teste da Matriz de Sensibilidade da Selic');
const matrix = SensibilityMatrixModel.generate({
  selicAtual: 10.50,
  ipcaAtual: 4.90,
  populacao: 212583750,
  custoSelicPontoBi: 50.0,
  jurosBaseBi: 500
});
assert(matrix.length === 7, 'Matriz deve possuir 7 cenários (-3 pp a +3 pp)');
const baseline = matrix.find(m => m.isCurrent);
assert(baseline !== undefined, 'Cenário oficial atual deve estar marcado na matriz');
assert(baseline.diffBi === 0.0, 'Variação vs atual no baseline deve ser R$ 0,0 Bi');

assert(baseline.totalJurosBi === 500, 'Cenário atual parte dos juros pagos de fato (R$ 500 Bi)');
const scenarioPlus1 = matrix.find(m => m.delta === 1.0);
assert(scenarioPlus1.diffBi === 50.0 && scenarioPlus1.totalJurosBi === 550, 'Aumento de 1 pp na Selic deve custar +R$ 50 Bi anuais (R$ 550 Bi)');

const scenarioMinus1 = matrix.find(m => m.delta === -1.0);
assert(scenarioMinus1.diffBi === -50.0, 'Redução de 1 pp na Selic deve economizar -R$ 50 Bi anuais');

// 4. Teste de Imutabilidade do MacroState
console.log('\n4. Teste de Imutabilidade da Entidade MacroState');
const state1 = MacroState.createDefault();
const state2 = state1.with({ selic: 12.00 });
assert(state1.selic === MacroState.createDefault().selic, 'state1 deve manter a Selic padrão');
assert(state2.selic === 12.00, 'state2 deve refletir a nova Selic de 12.00%');
assert(Object.isFrozen(state1), 'Instância de MacroState deve estar congelada (Object.freeze)');

// 5. Origem dos indicadores (ao vivo × referência)
console.log('\n5. Teste de Origem dos Indicadores');
assert(state1.fontes.ipca.aoVivo === false && state1.fontes.ipca.periodo === 'set/2026', 'Padrão marca IPCA como referência de set/2026');
const state3 = state1.with({ ipca: 4.6, fontes: { ipca: { periodo: 'out/2026', aoVivo: true } } });
assert(state3.fontes.ipca.aoVivo === true && state3.fontes.selic.aoVivo === false, 'with() troca só a origem informada');
assert(MacroObservatoryService.periodo('01/09/2026') === 'set/2026', 'Data do BCB vira período curto (set/2026)');
assert(MacroObservatoryService.periodo('2026') === '2026', 'Ano do IBGE fica como está');

// 6. Gateway: séries certas e leitura do IBGE SIDRA (fetch simulado, sem rede)
console.log('\n6. Teste do GovApiGateway com fetch simulado');
const urls = [];
// RREO simulado: só existem 2025 (bimestres 4 e 6) e 2026 até o 4º bimestre
const rreo = (total, saude, divida) => ({ items: [
  ['DESPESAS (EXCETO INTRA-ORÇAMENTÁRIAS) (I)', total], ['Saúde', saude], ['Atenção Básica', 1],
  ['Encargos Especiais', divida], ['Serviço da Dívida Interna', divida]
].map(([conta, valor]) => ({ coluna: 'DESPESAS LIQUIDADAS ATÉ O BIMESTRE (d)', rotulo: 'Total das Despesas Exceto Intra-Orçamentárias', conta, valor })) });
const rreos = { '2025-6': rreo(3600e9, 200e9, 600e9), '2025-4': rreo(2400e9, 130e9, 400e9), '2026-4': rreo(2900e9, 150e9, 700e9) };
// Anexo 01: receita "Até o Bimestre (c)" e despesa liquidada "(h)"; a linha intra-orçamentária tem código próprio
const anexo01 = (impostos, contribuicoes, despesa, juros) => ({ items: [
  { cod_conta: 'ReceitaTributaria', coluna: 'Até o Bimestre (c)', valor: impostos },
  { cod_conta: 'ReceitaDeContribuicoes', coluna: 'Até o Bimestre (c)', valor: contribuicoes },
  { cod_conta: 'ReceitaDeContribuicoesIntra', coluna: 'Até o Bimestre (c)', valor: 999e9 },
  { cod_conta: 'DespesasExcetoIntraOrcamentarias', coluna: 'DESPESAS LIQUIDADAS ATÉ O BIMESTRE (h)', valor: despesa },
  { cod_conta: 'JurosEEncargosDaDivida', coluna: 'DESPESAS LIQUIDADAS ATÉ O BIMESTRE (h)', valor: juros },
  { cod_conta: 'JurosEEncargosDaDivida', coluna: 'DESPESAS EMPENHADAS ATÉ O BIMESTRE (f)', valor: 1 }
] });
const anexos01 = { '2025-6': anexo01(1100e9, 1500e9, 3600e9, 360e9), '2025-4': anexo01(750e9, 950e9, 2400e9, 270e9), '2026-4': anexo01(850e9, 1050e9, 2900e9, 410e9) };
globalThis.fetch = async (url) => {
  urls.push(url);
  let body;
  if (url.includes('agregados/6381')) body = [{ resultados: [{ series: [{ serie: { '202608': '5.3', '202609': '5.2' } }] }] }];
  else if (url.includes('ibge')) body = [{ resultados: [{ series: [{ serie: { '2026': '214211951' } }] }] }];
  else if (url.includes('siconfi')) {
    const [, ano, bim] = /an_exercicio=(\d+)&nr_periodo=(\d)/.exec(url);
    body = (url.includes('Anexo%2001') ? anexos01 : rreos)[`${ano}-${bim}`] || { items: [] };
  } else body = [{ data: '01/08/2026', valor: '4.44' }, { data: '01/09/2026', valor: '4.58' }];
  return { ok: true, status: 200, json: async () => body };
};
const sync = await new GovApiGateway().syncAll();
const despesasSync = sync.despesas;
assert(despesasSync && despesasSync.ano === 2026 && despesasSync.bimestre === 4 && despesasSync.date === 'set/2025–ago/2026', 'SICONFI: acha o último bimestre publicado (2026, 4º) e rotula set/2025–ago/2026');
assert(despesasSync.value.total === 4100e9 && despesasSync.value.Saúde === 220e9, 'SICONFI: 12 meses = 2025 fechado − 2025 até ago + 2026 até ago');
assert(despesasSync.value['Encargos Especiais/Serviço da Dívida Interna'] === 900e9, 'SICONFI: subfunção fica presa à função de origem');
assert(urls.some(u => u.includes('bcdata.sgs.13522/')) && !urls.some(u => u.includes('bcdata.sgs.433/')), 'IPCA 12m usa a série 13522 (não a 433, que é mensal)');
const orc = sync.orcamento;
assert(orc && orc.date === 'set/2025–ago/2026' && orc.value.impostos === 1200e9 && orc.value.contribuicoes === 1600e9, 'SICONFI Anexo 01: receita federal em 12 meses (sem a linha intra-orçamentária)');
assert(orc.value.juros === 500e9 && orc.value.despesaTotal === 4100e9, 'SICONFI Anexo 01: juros pagos e despesa total em 12 meses (só a coluna liquidada)');
assert(sync.ipca.value === 4.58 && sync.ipca.historico.length === 2 && sync.ipca.historico[0].data === '08/2026', 'SGS: último valor do período e histórico mensal');
const mensal = GovApiGateway.mensal([{ data: '30/09/2026', valor: '15' }, { data: '01/10/2026', valor: '15' }, { data: '31/10/2026', valor: '14.25' }]);
assert(mensal.length === 2 && mensal[1].valor === 14.25, 'Série diária vira um ponto por mês (último valor do mês)');
assert(sync.populacao && sync.populacao.value === 214211951 && sync.populacao.date === '2026', 'População lida do IBGE SIDRA 6579');
const service = new MacroObservatoryService({ apiGateway: new GovApiGateway() });
await service.syncOfficialFeeds();
assert(service.contarAoVivo() === 9 && service.totalSincronizavel() === 9 && service.state.fontes.ipca.periodo === 'set/2026', 'Sincronização marca os 9 indicadores como ao vivo');
assert(service.getPublicFinanceProfile().imposto.bi === 2800 && service.getPublicFinanceProfile().juros.bi === 500, 'Receita e juros ao vivo da União entram no perfil');
assert(service.state.historicos.ipca.length === 2 && service.state.selicOficial === 4.58, 'Sincronização guarda o histórico e a Selic oficial');
assert(service.state.fontes.despesas.periodo === 'set/2025–ago/2026' && service.getPublicFinanceProfile().gastosTotal.bi === 4100, 'Gastos ao vivo do Tesouro entram no perfil');
assert(urls.some(u => u.includes('bcdata.sgs.13761/')) && urls.some(u => u.includes('bcdata.sgs.4382/')), 'Dívida em R$ (SGS 13761) e PIB 12 meses (SGS 4382) são consultados');
assertCloseTo(service.state.dbggTri, 4.58 / 1e6, 1e-9, 'Valor do SGS 13761 em R$ milhões vira R$ Tri');
assert(service.state.fontes.eleitores.aoVivo === false, 'Eleitorado continua como referência do TSE (não há API ao vivo)');
const urlsAntes = urls.length;
const semTesouro = new MacroObservatoryService({ apiGateway: new GovApiGateway({ incluirTesouro: false }) });
await semTesouro.syncOfficialFeeds();
assert(!urls.slice(urlsAntes).some(u => u.includes('siconfi')) && semTesouro.totalSincronizavel() === 7 && semTesouro.contarAoVivo() === 7, 'No navegador o Tesouro não é consultado nem contado (7 de 7)');
globalThis.fetch = async () => { throw new Error('offline'); };
const offline = new MacroObservatoryService({ apiGateway: new GovApiGateway() });
await offline.syncOfficialFeeds();
assert(offline.contarAoVivo() === 0 && offline.state.selic === MacroState.createDefault().selic, 'Sem rede, mantém os valores de referência');

// 6b. Última consulta salva no aparelho
console.log('\n6b. Teste do LocalSnapshotStore (reabrir com os dados salvos)');
const memoria = new Map();
const storageFalso = { getItem: k => memoria.get(k) ?? null, setItem: (k, v) => memoria.set(k, v) };
const cache = new LocalSnapshotStore({ storage: storageFalso });
const comCache = new MacroObservatoryService({ apiGateway: { syncAll: async () => sync }, cache });
await comCache.syncOfficialFeeds();
assert(memoria.size === 1 && cache.ler().campos.ipca === 4.58, 'Sincronização bem-sucedida grava a consulta no aparelho');
const reaberto = new MacroObservatoryService({ cache });
assert(reaberto.restaurarSalvo() === true && reaberto.state.ipca === 4.58, 'Ao reabrir, os números salvos voltam antes de buscar os novos');
assert(reaberto.state.fontes.ipca.salvo === true && reaberto.state.fontes.ipca.aoVivo === false && reaberto.contarAoVivo() === 0, 'Salvo fica marcado como "salvo", não como atualizado agora');
assert(reaberto.getPublicFinanceProfile().juros.bi === 500, 'Orçamento da União também volta do salvo');
assert(new MacroObservatoryService({ cache: new LocalSnapshotStore({ storage: { getItem: () => '{quebrado', setItem() {} } }) }).restaurarSalvo() === false, 'Salvo corrompido é ignorado');
assert(new LocalSnapshotStore({ storage: null }).ler() === null, 'Sem armazenamento (navegação privada), segue sem salvo');

// 6c. Link do cenário
console.log('\n6c. Teste do CenarioUrl (cenário no endereço da página)');
const link = CenarioUrl.montar('https://x/index.html#velho', { selic: 11, ipca: 4.5, base: 'eleitores', aba: 'tabFiscal', grafico: 'total' });
assert(link === 'https://x/index.html#selic=11&ipca=4.5&base=eleitores&aba=tabFiscal&grafico=total', 'Monta o link com os valores e troca o # antigo');
const lido = CenarioUrl.ler(link);
assert(lido.selic === 11 && lido.ipca === 4.5 && lido.base === 'eleitores' && lido.aba === 'tabFiscal' && lido.grafico === 'total', 'Lê de volta o mesmo cenário');
assert(!CenarioUrl.montar('https://x/', { grafico: 'pessoa' }).includes('grafico'), 'Gráfico por pessoa (padrão) não vai no link');
const invalido = CenarioUrl.ler('https://x/#selic=99&base=municipios&grafico=pizza&ipca=3,5');
assert(invalido.selic === undefined && invalido.base === undefined && invalido.grafico === undefined && invalido.ipca === 3.5, 'Valores fora da faixa ou desconhecidos são ignorados; vírgula decimal é aceita');
assert(CenarioUrl.ler('https://x/index.html') === null, 'Sem # não há cenário');

// 7. Valores por habitante e por eleitor
console.log('\n7. Teste do Perfil por Habitante e por Eleitor');
const despesasTeste = { total: 2000e9, 'Previdência Social': 800e9, 'Saúde': 200e9, 'Encargos Especiais/Serviço da Dívida Interna': 300e9 };
const orcamentoTeste = { impostos: 1000e9, contribuicoes: 2000e9, despesaTotal: 2000e9, juros: 500e9, previdencia: 800e9 };
const perfil = PublicFinanceModel.profile({
  pibBaseTri: 10, dbgg: 80, dbggTri: 8, populacao: 200e6, eleitores: 150e6,
  despesas: despesasTeste, orcamento: orcamentoTeste
});
assert(perfil.imposto.bi === 3000 && perfil.imposto.porHabitante === 15000 && perfil.imposto.porEleitor === 20000, 'Impostos e contribuições federais R$ 3 Tri = R$ 15.000/hab e R$ 20.000/eleitor');
assert(perfil.divida.bi === 8000 && perfil.divida.porHabitante === 40000 && perfil.divida.pctPib === 80, 'Dívida R$ 8 Tri = R$ 40.000/hab (80% do PIB)');
assert(perfil.juros.bi === 500, 'Juros = os pagos pela União (SICONFI Anexo 01), não a estimativa');
assert(perfil.gastosTotal.bi === 2000 && perfil.gastosTotal.porHabitante === 10000, 'Gastos da União R$ 2 Tri = R$ 10.000/hab');
const somaGastos = perfil.gastos.reduce((a, g) => a + g.bi, 0);
assertCloseTo(somaGastos, 2000, 0.05, 'Grupos de gasto + "Demais funções" fecham com o total do Tesouro');
assert(perfil.gastos.find(g => g.chave === 'previdencia').pctGastos === 40, 'Previdência = 40% do gasto da União');
assert(perfil.gastos.find(g => g.chave === 'demais').bi === 700, '"Demais funções" = total − grupos (R$ 700 Bi)');
const resumo = UnionBudgetModel.resumo(orcamentoTeste);
assert(resumo.grupos.find(g => g.chave === 'demais').bi === 700, 'Composição: "Demais despesas" = total − grupos (R$ 700 Bi)');
assert(UnionBudgetModel.jurosCenario(100, 5, 10, 50) === 0, 'Juros do cenário não ficam negativos');
assert(UnionBudgetModel.extrair([]) === null, 'Anexo 01 sem itens vira null');
let erroBase = false;
try { PublicFinanceModel.porPessoa(1, 0); } catch (e) { erroBase = true; }
assert(erroBase, 'Base de cálculo zero é rejeitada');

// 7b. Leitura do RREO do SICONFI
console.log('\n7b. Teste do UnionSpendingModel (RREO Anexo 02)');
assert(UnionSpendingModel.extrair([]) === null, 'Bimestre não publicado (sem itens) vira null');
assert(UnionSpendingModel.periodo(2026, 4) === 'set/2025–ago/2026', 'Período do 4º bimestre: set/2025–ago/2026');
assert(UnionSpendingModel.periodo(2025, 6) === 'jan–dez/2025', 'Período do 6º bimestre: o próprio ano');
const soAno = UnionSpendingModel.acumulado12m({ total: 9 }, null, { total: 5 });
assert(soAno.total === 5, 'No 6º bimestre não há desconto do ano anterior');
const ref = MacroState.createDefault();
assert(ref.despesas.total > 3e12 && ref.fontes.despesas.aoVivo === false, 'Referência do Tesouro vem embutida (funciona offline)');

// 8. Base de cálculo da simulação
console.log('\n8. Teste da Base de Cálculo (habitantes × eleitores)');
const base = new MacroObservatoryService({});
const porHab = base.simulateFiscalModel().porBase;
base.setBaseCalculo('eleitores');
const porEleitor = base.simulateFiscalModel().porBase;
assert(porHab.base === 'populacao' && porEleitor.base === 'eleitores', 'Simulação informa a base usada');
assert(porEleitor.imposto > porHab.imposto, 'Valor por eleitor é maior que por habitante (há menos eleitores)');
assertCloseTo(porEleitor.imposto / porHab.imposto, base.state.populacao / base.state.eleitores, 0.001, 'Razão eleitor/habitante = população/eleitorado');
const matrizEleitor = base.getSensibilityMatrix().find(m => m.delta === 1.0);
assert(matrizEleitor.perCapitaImpact === Math.round(50e9 / base.state.eleitores), 'Matriz da Selic divide pela base escolhida');
let erroEstado = false;
try { MacroState.createDefault().with({ baseCalculo: 'municipios' }); } catch (e) { erroEstado = true; }
assert(erroEstado, 'Base de cálculo desconhecida é rejeitada');
const fiscalTri = DebtTrajectoryModel.simulate({ dbggBase: 80, pibBaseTri: 10, growth: 0, selic: 0, ipca: 0, taxRate: 34.2, spendVariation: 0 });
assert(fiscalTri.trajectoryTri.length === 5 && fiscalTri.debtYear5Tri === fiscalTri.trajectoryTri[4], 'Trajetória também sai em R$ Tri');

// Preferências: só bases conhecidas entram e saem
const salvos = new Map();
const preferencias = new PreferenciasStore({ storage: { getItem: k => salvos.get(k) ?? null, setItem: (k, v) => salvos.set(k, v) } });
assert(preferencias.lerBase() === null, 'Sem escolha salva, não há base padrão');
preferencias.salvarBase('eleitores');
assert(preferencias.lerBase() === 'eleitores', 'Base escolhida volta na próxima leitura');
preferencias.salvarBase('municipios');
assert(preferencias.lerBase() === 'eleitores', 'Base desconhecida não é gravada');
salvos.set('calculadora.base', 'municipios');
assert(preferencias.lerBase() === null, 'Valor salvo inválido é ignorado');
const bloqueado = new PreferenciasStore({ storage: { getItem() { throw new Error('bloqueado'); }, setItem() { throw new Error('bloqueado'); } } });
bloqueado.salvarBase('eleitores');
assert(bloqueado.lerBase() === null, 'Armazenamento bloqueado não derruba o app');

// 9. Superávit primário que estabiliza a dívida (spec 3.1)
console.log('\n9. Teste do DebtStabilizationModel (primário que mantém a dívida estável)');
const estab = args => DebtStabilizationModel.primarioEstabilizador(args);
assertCloseTo(estab({ dividaPctPib: 80, jurosRealPct: 5, crescimentoRealPct: 2 }).valor.primarioPct, 2.3529, 0.0001, 'T1: d=80, r=5, g=2 → s* = 2,3529% do PIB');
assert(estab({ dividaPctPib: 80, jurosRealPct: 2, crescimentoRealPct: 2 }).valor.primarioPct === 0, 'T2: r = g → primário estabilizador é 0');
assertCloseTo(estab({ dividaPctPib: 80, jurosRealPct: 1, crescimentoRealPct: 3 }).valor.primarioPct, -1.5534, 0.0001, 'T3: r < g → s* negativo (pode haver déficit)');
let erroEstab = 0;
for (const args of [
  { dividaPctPib: 80, jurosRealPct: 5, crescimentoRealPct: -100 }, { dividaPctPib: 80, jurosRealPct: 5, crescimentoRealPct: -150 },
  { dividaPctPib: 80, jurosRealPct: -100, crescimentoRealPct: 2 }, { dividaPctPib: -1, jurosRealPct: 5, crescimentoRealPct: 2 },
  { dividaPctPib: NaN, jurosRealPct: 5, crescimentoRealPct: 2 }, { dividaPctPib: 80, jurosRealPct: Infinity, crescimentoRealPct: 2 },
  { dividaPctPib: 80, jurosRealPct: 5, crescimentoRealPct: 2, primarioSimuladoPct: NaN }
]) { try { estab(args); } catch (e) { if (e instanceof RangeError) erroEstab++; } }
assert(erroEstab === 7, 'T4: g ≤ −100%, r ≤ −100%, dívida negativa e entradas não finitas lançam RangeError (7 de 7)');
// T5: coerência com a dinâmica do DebtTrajectoryModel: com s = s*, a dívida não muda
const sEstrela = estab({ dividaPctPib: 80, jurosRealPct: 5, crescimentoRealPct: 2 }).valor.primarioPct;
const dinamica = 80 + 80 * ((0.05 - 0.02) / 1.02) - sEstrela;
assert(Math.abs(dinamica - 80) < 1e-9, 'T5: d + d·(r−g)/(1+g) − s* = d (tolerância 1e-9)');
const comDif = estab({ dividaPctPib: 80, jurosRealPct: 5, crescimentoRealPct: 2, primarioSimuladoPct: 1 });
assertCloseTo(comDif.valor.diferencaPp, 1 - 2.352941, 1e-5, 'Diferença = primário simulado − estabilizador (negativo: a dívida sobe)');
assert(comDif.formulaExata === false && estab({ dividaPctPib: 80, jurosRealPct: 5, crescimentoRealPct: 2 }).valor.diferencaPp === undefined, 'Fórmula não é exata (premissas de cenário) e sem primário simulado não há diferença');

// 10. Índice de miséria (spec 3.2)
console.log('\n10. Teste do MiseryIndexModel (inflação 12 meses + desocupação)');
const m1 = MiseryIndexModel.indice({ inflacao12mPct: 4.58, desocupacaoPct: 5.60, mesInflacao: '09/2026', mesDesocupacao: '09/2026' });
assertCloseTo(m1.valor, 10.18, 1e-9, 'T1: 4,58 + 5,60 = 10,18');
assert(m1.formulaExata === true && m1.avisos.length === 0, 'Mesmo mês de referência: fórmula exata, sem aviso');
const m2 = MiseryIndexModel.indice({ inflacao12mPct: 4.63, desocupacaoPct: 5.2, mesInflacao: '10/2026', mesDesocupacao: '09/2026' });
assert(m2.formulaExata === false && m2.avisos.length === 1 && m2.avisos[0].startsWith('períodos diferentes') && m2.avisos[0].includes('10/2026') && m2.avisos[0].includes('09/2026'), 'T2: períodos diferentes → selo estimativa e aviso com os dois períodos');
assert(MiseryIndexModel.indice({ inflacao12mPct: 4, desocupacaoPct: 5 }).formulaExata === true, 'Sem meses informados não há como acusar período diferente');
let erroMiseria = 0;
for (const args of [{ inflacao12mPct: NaN, desocupacaoPct: 5 }, { inflacao12mPct: 4, desocupacaoPct: undefined }, { inflacao12mPct: -100, desocupacaoPct: 5 }, { inflacao12mPct: 4, desocupacaoPct: -1 }, { inflacao12mPct: 4, desocupacaoPct: 101 }]) {
  try { MiseryIndexModel.indice(args); } catch (e) { if (e instanceof RangeError) erroMiseria++; }
}
assert(erroMiseria === 5, 'T3: NaN, indefinido, inflação ≤ −100% e desocupação fora de 0 a 100 lançam RangeError (5 de 5)');
const serieMiseria = MiseryIndexModel.serie(
  [{ data: '08/2026', valor: 4.44 }, { data: '09/2026', valor: 4.58 }, { data: '10/2026', valor: 4.63 }],
  [{ data: '08/2026', valor: 5.3 }, { data: '09/2026', valor: 5.2 }]);
assert(serieMiseria.length === 2 && serieMiseria[1].data === '09/2026' && Math.abs(serieMiseria[1].valor - 9.78) < 1e-9, 'Série do índice só nos meses em que as duas séries existem');
assert(MiseryIndexModel.serie().length === 0, 'Sem séries, a série do índice é vazia');

// 11. Trajetória sem a trava de 20% (decisão do Celso, 19/11/2026)
console.log('\n11. Teste da trajetória sem piso e com aviso');
const base11 = { dbggBase: 80, pibBaseTri: 13.4, growth: 2, selic: 13.75, ipca: 4.58, taxRate: 32.22, spendVariation: 0 };
const padrao = DebtTrajectoryModel.simulate(base11);
assertCloseTo(padrao.primarioPct, -0.15, 0.005, 'Na carga de referência o primário é receita 19,25% − despesa 19,40% = −0,15% do PIB (comportamento migrado)');
assert(padrao.foraDoIntervalo === false && padrao.avisos.length === 0, 'Trajetória normal não traz aviso');
const superavit = DebtTrajectoryModel.simulate({ ...base11, dbggBase: 30, taxRate: 42, spendVariation: -6 });
assert(superavit.trajectory.some(d => d < 20), 'A dívida pode passar de 20% do PIB para baixo: o piso saiu');
const negativa = DebtTrajectoryModel.simulate({ ...base11, dbggBase: 5, taxRate: 42, spendVariation: -6 });
assert(negativa.trajectory.some(d => d < 0), 'Sem piso, a dívida projetada pode ficar negativa (e o modelo avisa)');
assert(negativa.foraDoIntervalo === true && negativa.avisos[0] === 'trajetória fora do intervalo do modelo', 'Fora do intervalo do modelo: aviso "trajetória fora do intervalo do modelo"');
const explode = DebtTrajectoryModel.simulate({ ...base11, dbggBase: 190, growth: -2, selic: 16, ipca: 2, spendVariation: 6 });
assert(Math.max(...explode.trajectory) > 200 && explode.foraDoIntervalo === true, 'Acima de 200% do PIB também é fora do intervalo do modelo');
assert(DebtTrajectoryModel.INTERVALO_MODELO.minPct === 0 && Object.isFrozen(DebtTrajectoryModel.INTERVALO_MODELO), 'O intervalo do modelo é uma constante congelada');

// 12. Parâmetros comuns no 8.3 (ADR-001): defaults do domínio batem com o módulo e o adaptador faz a ponte
console.log('\n12. Teste dos parâmetros comuns (adaptador e defaults do domínio)');
const params = new ParametrosVendor();
const estadoRef = MacroObservatoryService.estadoDeReferencia(params);
const dominio = MacroState.createDefault();
assert(params.valor('carga_tributaria_bruta_gg') === 32.22 && estadoRef.taxRatio === 32.22, 'Carga tributária de referência = 32,22% (Tesouro, 2024), não mais 34,2%');
assert(dominio.taxRatio === params.valor('carga_tributaria_bruta_gg') && dominio.pibReal === params.valor('pib_real_projecao') && dominio.custoSelicPontoBi === params.valor('custo_selic_ponto_bi'), 'Defaults do MacroState = parâmetros (taxRatio, pibReal, custoSelicPontoBi)');
assert(dominio.eleitores === params.valor('eleitorado_tse') && dominio.populacao === params.valor('populacao_residente') && dominio.pibBaseTri === params.valor('pib_nominal_12m'), 'Defaults do MacroState = parâmetros (eleitores, população, PIB de 12 meses)');
const explicito = { ...base11, receitaUniaoPctPib: params.valor('receita_uniao_pct_pib'), despesaUniaoPctPib: params.valor('despesa_uniao_pct_pib'), cargaReferenciaPct: params.valor('carga_tributaria_bruta_gg') };
assert(JSON.stringify(DebtTrajectoryModel.simulate(base11)) === JSON.stringify(DebtTrajectoryModel.simulate(explicito)), 'Defaults de DebtTrajectoryModel (receita 19,25, despesa 19,40, carga de referência) = parâmetros');
assert(SensibilityMatrixModel.generate({ selicAtual: 10, ipcaAtual: 4, populacao: 1e8, jurosBaseBi: 500 }).find(c => c.delta === 1).diffBi === params.valor('custo_selic_ponto_bi'), 'Default da matriz de sensibilidade = custo por ponto de Selic do parâmetro');
assert(params.vigencia('pib_nominal_12m').fonte.url.startsWith('https://') && params.valor('pib_nominal_12m') !== params.valor('pib_nominal_anual'), 'PIB de 12 meses (BCB SGS 4382, usado aqui) e PIB do ano fechado (IBGE) são parâmetros distintos');
assert(params.insumo('pib_real_projecao').tipo === 'estimativa' && params.insumo('pib_real_projecao').status === 'a-confirmar', 'Crescimento real do PIB entra como insumo estimativa / a-confirmar');
const falso = new ParametrosVendor({ valor: () => undefined, selo: () => 'exato' });
assert(MacroObservatoryService.estadoDeReferencia(falso).taxRatio === dominio.taxRatio, 'Parâmetro sem vigência mantém o padrão do domínio');

// 13. Serviço: primário estabilizador e índice de miséria com selo e insumos
console.log('\n13. Teste do serviço (selo, insumos e períodos)');
const refSvc = new MacroObservatoryService({});
const estabRef = refSvc.getDebtStabilization();
assert(estabRef.selo === 'estimativa', 'Primário estabilizador é sempre estimativa (g e r são premissas)');
assert(estabRef.insumos.map(i => i.id).join() === 'bcb_sgs_13762,bcb_sgs_432,bcb_sgs_13522,pib_real_projecao', 'Insumos: DBGG, Selic, IPCA e crescimento do parâmetro');
assert(estabRef.insumos.every(i => i.status === 'a-confirmar'), 'Sem consulta às fontes, os insumos são valores de referência (a-confirmar)');
const rEsperado = FisherModel.calculateRealRate(refSvc.state.selic, refSvc.state.ipca);
assertCloseTo(estabRef.valor.primarioPct, refSvc.state.dbgg * ((rEsperado / 100) - (refSvc.state.pibReal / 100)) / (1 + refSvc.state.pibReal / 100), 1e-9, 'Valor = d·(r−g)/(1+g) com r de Fisher (Selic e IPCA) e g do estado');
assertCloseTo(estabRef.valor.diferencaPp, refSvc.simulateFiscalModel().primarioPct - estabRef.valor.primarioPct, 1e-12, 'Diferença é o primário do cenário menos o estabilizador');
const miseriaRef = refSvc.getMiseryIndex();
assertCloseTo(miseriaRef.valor, 4.58 + 5.2, 1e-9, 'Índice de miséria de referência = IPCA + desocupação do estado');
assert(miseriaRef.selo === 'estimativa' && miseriaRef.avisos.length === 0, 'Referência (não atualizada): estimativa, mas sem aviso de períodos (os dois são de set/2026)');
await service.syncOfficialFeeds();
const miseriaViva = service.getMiseryIndex();
assert(miseriaViva.selo === 'exato' && miseriaViva.avisos.length === 0 && miseriaViva.insumos.every(i => i.status === 'confirmado'), 'Os dois ao vivo e do mesmo mês: selo exato');
assertCloseTo(miseriaViva.valor, 4.58 + 5.2, 1e-9, 'Índice ao vivo = 4,58 + 5,2');
assert(miseriaViva.periodos.desocupacao === 'jul–set/2026' && miseriaViva.periodos.inflacao === 'set/2026', 'Mostra os dois períodos (inflação em set/2026, desocupação em jul–set/2026)');
assert(miseriaViva.serie.length === 2 && miseriaViva.serie[1].data === '09/2026', 'Histórico do índice vem do IPCA e da PNAD nos meses em comum');
const descasado = service.state.with({ fontes: { ipca: { ...service.state.fontes.ipca, mes: '10/2026', periodo: 'out/2026' } } });
const svcDescasado = new MacroObservatoryService({ initialState: descasado });
const miseriaDescasada = svcDescasado.getMiseryIndex();
assert(miseriaDescasada.selo === 'estimativa' && miseriaDescasada.avisos[0].startsWith('períodos diferentes'), 'Períodos diferentes: selo estimativa e aviso (T2)');
const ruim = new MacroObservatoryService({ initialState: service.state.with({ desocupacao: NaN }) });
let erroServico = false;
try { ruim.getMiseryIndex(); } catch (e) { erroServico = e instanceof RangeError; }
assert(erroServico, 'T3: desocupação NaN lança RangeError também pelo serviço');
const fiscalSvc = refSvc.simulateFiscalModel();
assert(Array.isArray(fiscalSvc.avisos) && typeof fiscalSvc.foraDoIntervalo === 'boolean', 'A simulação do serviço traz os avisos do modelo');
assert(refSvc.getMacroDashboardMetrics().desocupacao === 5.2, 'Painel expõe a desocupação para o cartão');
const relatorio = refSvc.generateConsolidatedReport({ fiscalData: fiscalSvc });
assert(relatorio.includes('Primario que mantem a divida estavel') && relatorio.includes('Indice de miseria') && relatorio.includes('(estimativa)'), 'Relatório copiado traz o primário estabilizador e o índice de miséria com o selo');

// 13b. BUG-01: o slider do Simulador não pode contaminar o índice de miséria nem rotular premissa como oficial
console.log('\n13b. Regressão BUG-01 (valor oficial separado do valor de cenário)');
const gwBug = { syncAll: async () => ({ ipca: { value: 4.63, date: '01/10/2026' }, desocupacao: { value: 5.2, date: 'jul–set/2026', mes: '10/2026' }, selic: { value: 13.75, date: '01/11/2026' } }) };
const svcBug = new MacroObservatoryService({ apiGateway: gwBug });
await svcBug.syncOfficialFeeds();
const antes = svcBug.getMiseryIndex();
assertCloseTo(antes.valor, 9.83, 1e-9, 'Depois do sync: índice de miséria 9,83');
assert(antes.selo === 'exato' && antes.avisos.length === 0, 'Depois do sync, mesmo mês: selo exato');
svcBug.updateFiscalParams({ ipca: 9 });
const depois = svcBug.getMiseryIndex();
assertCloseTo(depois.valor, 9.83, 1e-9, 'Slider do IPCA em 9 não muda o índice de miséria (continua 9,83)');
assert(depois.selo === 'exato' && depois.insumos.every(i => i.tipo === 'oficial' && i.status === 'confirmado'), 'Índice continua exato com insumos oficiais e confirmados');
const estabSlider = svcBug.getDebtStabilization();
const insIpca = estabSlider.insumos.find(i => i.id === 'cenario_ipca');
assert(insIpca && insIpca.valor === 9 && insIpca.tipo === 'estimativa' && insIpca.status === 'a-confirmar', 'Primário estabilizador: IPCA do slider entra como insumo de cenário (estimativa)');
assert(!estabSlider.insumos.some(i => i.id === 'bcb_sgs_13522') && estabSlider.insumos.some(i => i.id === 'bcb_sgs_432' && i.status === 'confirmado'), 'Selic não mexida segue oficial; IPCA oficial não aparece com o valor do slider');
svcBug.updateFiscalParams({ ipca: 4.63 });
assert(svcBug.getDebtStabilization().insumos.some(i => i.id === 'bcb_sgs_13522' && i.status === 'confirmado'), 'Slider de volta ao valor oficial: insumo volta a oficial');
svcBug.updateFiscalParams({ selic: 10 });
assert(svcBug.getDebtStabilization().insumos.some(i => i.id === 'cenario_selic' && i.tipo === 'estimativa'), 'Slider da Selic também vira insumo de cenário');
const salvoBug = new MacroObservatoryService({ cache });
salvoBug.restaurarSalvo();
salvoBug.updateFiscalParams({ ipca: 9 });
assertCloseTo(salvoBug.getMiseryIndex().valor, 4.58 + 5.2, 1e-9, 'Também ao reabrir com dados salvos, o slider não mexe no índice');

const oficialAntes = svcBug.getMacroDashboardMetrics().oficiais;
svcBug.updateFiscalParams({ ipca: 9, selic: 8, pibBaseTri: 11 });
const mSlider = svcBug.getMacroDashboardMetrics();
assert(mSlider.oficiais.ipca === 4.63 && mSlider.oficiais.selic === 13.75 && mSlider.oficiais.pibBaseTri === oficialAntes.pibBaseTri && mSlider.ipca === 9, 'Painel oficial (IPCA, Selic, PIB) não muda quando o slider muda; o cenário muda');
assert(mSlider.oficiais.dbgg === oficialAntes.dbgg && mSlider.oficiais.desocupacao === 5.2, 'Dívida e desocupação oficiais também ficam como estavam');

// Cartões calculados a partir dos dados oficiais não seguem os sliders; relatório e CSV separam o cenário
const calcAntes = new MacroObservatoryService({ apiGateway: gwBug });
await calcAntes.syncOfficialFeeds();
const cartoes = () => { const m = calcAntes.getMacroDashboardMetrics(); const p = calcAntes.getPublicFinanceProfile(); return JSON.stringify([m.juroReal, m.receitaPctPib, m.impostoPerCapita, m.jurosPerCapita, p.divida, p.imposto, p.juros]); };
const cartoesAntes = cartoes();
calcAntes.updateFiscalParams({ selic: 8, ipca: 9, pibBaseTri: 11, spendVariation: 3 });
assert(cartoes() === cartoesAntes, 'Slider de Selic, IPCA, PIB e gastos não muda nenhum cartão "calculado a partir dos dados oficiais"');
assertCloseTo(calcAntes.getMacroDashboardMetrics().juroReal, FisherModel.calculateRealRate(13.75, 4.63), 0.005, 'Juro real do cartão usa a Selic e o IPCA oficiais (13,75 e 4,63)');
assertCloseTo(calcAntes.getMacroDashboardMetrics().juroRealCenario, FisherModel.calculateRealRate(8, 9), 0.005, 'O juro real do cenário existe à parte');
const linhasCsv = CsvExporter.linhas(calcAntes.csvData({ fiscalData: calcAntes.simulateFiscalModel() }));
const csvPor = Object.fromEntries(linhasCsv.map(l => [l[0], l]));
assert(csvPor.Taxa_Meta_Selic[1] === 13.75 && csvPor.IPCA_Acumulado_12M[1] === 4.63 && csvPor.PIB_Nominal_Base[1] === calcAntes.oficial.pibBaseTri, 'CSV: indicadores oficiais com o valor oficial');
assert(csvPor.Cenario_Taxa_Selic[1] === 8 && csvPor.Cenario_IPCA[1] === 9 && csvPor.Cenario_PIB_Nominal[1] === 11, 'CSV: valores dos sliders só nas linhas Cenario_*');
assert(linhasCsv.filter(l => l[0].startsWith('Cenario_')).every(l => l[3].startsWith('Cenario do simulador')) && !linhasCsv.some(l => /^(Crescimento_Real_PIB|Carga_Tributaria_Bruta_Governo_Geral|Divida_Projetada_Ano_5)$/.test(l[0])), 'CSV: toda linha de cenário marca a origem e as antigas sem rótulo saíram');
const textoRel = calcAntes.generateConsolidatedReport({ fiscalData: calcAntes.simulateFiscalModel() });
assert(textoRel.includes('Taxa Meta Selic (oficial): 13,75%') && textoRel.includes('Cenario do simulador: Selic 8,00% a.a., IPCA 9,00% a.a.') && textoRel.includes('Cenario do simulador: Projecao da Divida'), 'Relatório: oficial e cenário em blocos separados, com o cenário rotulado');

// 14. Gateway: desocupação da PNAD Contínua
console.log('\n14. Teste do GovApiGateway (desocupação, IBGE SIDRA 6381)');
assert(GovApiGateway.trimestreMovel('202609') === 'jul–set/2026' && GovApiGateway.trimestreMovel('202603') === 'jan–mar/2026', 'Trimestre móvel dentro do ano: jul–set/2026');
assert(GovApiGateway.trimestreMovel('202601') === 'nov/2025–jan/2026' && GovApiGateway.trimestreMovel('202602') === 'dez/2025–fev/2026', 'Trimestre móvel que cruza o ano: nov/2025–jan/2026');
globalThis.fetch = async url => ({ ok: true, status: 200, json: async () => [{ resultados: [{ series: [{ serie: { '202607': '5.3', '202608': '5.3', '202609': '5.2' } }] }] }] });
const desoc = await new GovApiGateway().fetchDesocupacaoPnad();
assert(desoc.value === 5.2 && desoc.date === 'jul–set/2026' && desoc.mes === '09/2026' && desoc.historico.length === 3, 'Último período, rótulo do trimestre e histórico mensal');
globalThis.fetch = async () => ({ ok: true, status: 200, json: async () => [{ resultados: [{ series: [{ serie: { '2026': '5.2' } }] }] }] });
assert(await new GovApiGateway().fetchDesocupacaoPnad() === null, 'Resposta fora do formato (sem períodos aaaamm) vira null');
globalThis.fetch = async () => ({ ok: false, status: 500, json: async () => ({}) });
assert(await new GovApiGateway().fetchDesocupacaoPnad() === null, 'HTTP 500 vira null (segue o valor de referência)');
assert(MacroObservatoryService.mes('01/09/2026') === '09/2026' && MacroObservatoryService.mes('2026') === null && MacroObservatoryService.mes('set/2025–ago/2026') === null, 'Mês de referência só sai de datas dd/mm/aaaa');

console.log(`\n========================================`);
console.log(`Total: ${passed + failed} | Passou: ${passed} | Falhou: ${failed}`);
console.log(`========================================\n`);

if (failed > 0) {
  process.exit(1);
}
