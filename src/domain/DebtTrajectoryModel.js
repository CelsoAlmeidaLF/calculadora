import { FisherModel } from './FisherModel.js?v=20261119-1252';
import { UnionBudgetModel } from './UnionBudgetModel.js?v=20261119-1252';

/**
 * Camada de Domínio: Modelo de Sustentabilidade e Trajetória da Dívida Pública (Tesouro / FMI)
 * Equação dinâmica de evolução da dívida em proporção do PIB:
 * Δd_t = d_{t-1} * ((r - g) / (1 + g)) - s_t
 *
 * Sem piso: uma dívida que "bate no chão" esconde o resultado em vez de mostrá-lo (ADR-001, decisão do Celso de 19/11/2026).
 * Quando a trajetória sai do INTERVALO_MODELO, o resultado traz um aviso.
 */
export class DebtTrajectoryModel {
  /**
   * Simula a trajetória da dívida bruta (DBGG) para um horizonte de 5 anos
   * @param {Object} params
   * @param {number} params.dbggBase Dívida bruta inicial % do PIB
   * @param {number} params.pibBaseTri PIB nominal base em Trilhões BRL
   * @param {number} params.growth Crescimento real do PIB % a.a. (g)
   * @param {number} params.selic Taxa nominal Selic % a.a.
   * @param {number} params.ipca Inflação IPCA % a.a. (π)
   * @param {number} params.taxRate Carga tributária bruta % do PIB
   * @param {number} params.spendVariation Variação real das despesas primárias % a.a.
   * @param {number} params.custoSelicPontoBi Custo por ponto percentual de Selic (R$ Bi)
   * @param {number} params.jurosBaseBi Juros pagos pela União em 12 meses (R$ Bi, SICONFI)
   * @param {number} params.selicReferencia Selic vigente quando os juros foram pagos (% a.a.)
   * @param {Array<{chave:string, rotulo:string, bi:number}>} params.gruposOrcamento Despesa real da União por grupo (UnionBudgetModel.resumo)
   * @param {number} [params.receitaUniaoPctPib=19.25] Receita da União em % do PIB na carga de referência (parâmetro receita_uniao_pct_pib)
   * @param {number} [params.despesaUniaoPctPib=19.40] Despesa da União em % do PIB (parâmetro despesa_uniao_pct_pib)
   * @param {number} [params.cargaReferenciaPct=32.22] Carga tributária em que a receita da União vale receitaUniaoPctPib
   *   (parâmetro carga_tributaria_bruta_gg); a receita varia na proporção taxRate / cargaReferenciaPct
   * @param {number} [params.horizon=5] Horizonte em anos
   * Os três valores acima são os de referência do módulo comum de parâmetros; o serviço sempre passa os lidos de lá.
   */
  static simulate({
    dbggBase,
    pibBaseTri,
    growth,
    selic,
    ipca,
    taxRate,
    spendVariation,
    custoSelicPontoBi = 50.0,
    // Sem os juros pagos, estima pela Selic inteira × custo por ponto
    jurosBaseBi = Number(selic) * Number(custoSelicPontoBi),
    selicReferencia = selic,
    gruposOrcamento = [],
    receitaUniaoPctPib = 19.25,
    despesaUniaoPctPib = 19.40,
    cargaReferenciaPct = 32.22,
    horizon = 5
  }) {
    const juroRealPct = FisherModel.calculateRealRate(selic, ipca);
    const r = juroRealPct / 100;
    const g = Number(growth) / 100;

    // PIB nominal anualizado projetado (R$ Bi)
    const pibNominalProjBi = (Number(pibBaseTri) * 1000) * (1 + (Number(growth) + Number(ipca)) / 100);
    const arrecadacaoBi = pibNominalProjBi * (Number(taxRate) / 100);
    // Juros: os pagos de fato, corrigidos pela diferença entre a Selic simulada e a vigente
    const custoJurosBi = UnionBudgetModel.jurosCenario(jurosBaseBi, selic, selicReferencia, custoSelicPontoBi);

    // Estimativa de Balanço Primário Proporcional da União
    // Receitas da União (receitaUniaoPctPib do PIB na carga de referência), ajustadas pela carga tributária
    const receitasUniao = pibNominalProjBi * (receitaUniaoPctPib / 100) * (Number(taxRate) / cargaReferenciaPct);
    // Despesas da União (despesaUniaoPctPib do PIB) ajustadas pelo crescimento real de gastos
    const despesasUniao = (pibNominalProjBi * (despesaUniaoPctPib / 100)) * (1 + Number(spendVariation) / 100);
    const primarioBi = receitasUniao - despesasUniao;
    const primarioPct = (primarioBi / pibNominalProjBi) * 100;
    const s = primarioPct / 100;

    // Trajetória ano a ano, em % do PIB e em R$ (PIB nominal cresce pelo real + inflação)
    let currentDebt = Number(dbggBase);
    let pibAnoTri = Number(pibBaseTri);
    const trajectory = [];
    const trajectoryTri = [];
    const { minPct, maxPct } = DebtTrajectoryModel.INTERVALO_MODELO;
    let foraDoIntervalo = false;

    for (let i = 1; i <= horizon; i++) {
      const delta = currentDebt * ((r - g) / (1 + g)) - (s * 100);
      currentDebt += delta;
      if (currentDebt < minPct || currentDebt > maxPct) foraDoIntervalo = true;
      pibAnoTri *= (1 + g) * (1 + Number(ipca) / 100);
      trajectory.push(Number(currentDebt.toFixed(2)));
      trajectoryTri.push(Number((pibAnoTri * currentDebt / 100).toFixed(3)));
    }

    // Composição real da despesa da União, com os juros do cenário e o gasto primário corrigido
    const composicao = UnionBudgetModel.cenario(gruposOrcamento, custoJurosBi, spendVariation);

    return {
      juroRealPct: Number(juroRealPct.toFixed(2)),
      pibNominalProjBi: Number(pibNominalProjBi.toFixed(2)),
      arrecadacaoBi: Number(arrecadacaoBi.toFixed(2)),
      custoJurosBi: Number(custoJurosBi.toFixed(2)),
      primarioBi: Number(primarioBi.toFixed(2)),
      primarioPct: Number(primarioPct.toFixed(2)),
      trajectory,
      trajectoryTri,
      debtYear5: trajectory[horizon - 1],
      debtYear5Tri: trajectoryTri[horizon - 1],
      foraDoIntervalo,
      avisos: foraDoIntervalo ? [DebtTrajectoryModel.AVISO_FORA_DO_INTERVALO] : [],
      composicao
    };
  }
}

/**
 * Faixa de dívida (% do PIB) em que o modelo ainda faz sentido: dívida bruta negativa não existe, e acima do
 * máximo as premissas de juro e crescimento constantes deixam de valer. É limite de validade do modelo, não dado.
 */
DebtTrajectoryModel.INTERVALO_MODELO = Object.freeze({ minPct: 0, maxPct: 200 });

/** Aviso mostrado quando algum ano da trajetória sai do INTERVALO_MODELO */
DebtTrajectoryModel.AVISO_FORA_DO_INTERVALO = 'trajetória fora do intervalo do modelo';
