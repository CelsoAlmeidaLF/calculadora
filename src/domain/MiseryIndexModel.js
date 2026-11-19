/**
 * Camada de Domínio: índice de miséria de Okun (spec novos-calculos-macro, 3.2)
 * Inflação em 12 meses + taxa de desocupação, as duas em pontos percentuais.
 */
export class MiseryIndexModel {
  /**
   * @param {Object} params
   * @param {number} params.inflacao12mPct IPCA acumulado em 12 meses (%)
   * @param {number} params.desocupacaoPct Taxa de desocupação da PNAD Contínua (%)
   * @param {string} [params.mesInflacao] Mês de referência da inflação ('mm/aaaa')
   * @param {string} [params.mesDesocupacao] Mês em que termina o trimestre móvel da desocupação ('mm/aaaa')
   * @returns {{valor: number, formulaExata: boolean, avisos: string[]}}
   *   formulaExata é true (soma de duas séries oficiais), exceto quando os meses de referência diferem:
   *   aí a soma junta períodos distintos, vira estimativa e traz o aviso "períodos diferentes".
   * @throws {RangeError} entrada não finita, inflação ≤ −100% ou desocupação fora de 0 a 100
   */
  static indice({ inflacao12mPct, desocupacaoPct, mesInflacao, mesDesocupacao }) {
    for (const [valor, nome] of [[inflacao12mPct, 'A inflação'], [desocupacaoPct, 'A desocupação']]) {
      if (typeof valor !== 'number' || !Number.isFinite(valor)) throw new RangeError(`${nome} deve ser um número finito`);
    }
    if (inflacao12mPct <= -100) throw new RangeError('A inflação deve ser maior que -100%');
    if (desocupacaoPct < 0 || desocupacaoPct > 100) throw new RangeError('A desocupação deve ficar entre 0% e 100%');

    const avisos = [];
    const diferentes = Boolean(mesInflacao && mesDesocupacao && mesInflacao !== mesDesocupacao);
    if (diferentes) avisos.push(`períodos diferentes: inflação de ${mesInflacao} e desocupação do trimestre até ${mesDesocupacao}`);
    return { valor: inflacao12mPct + desocupacaoPct, formulaExata: !diferentes, avisos };
  }

  /**
   * Série do índice mês a mês, só nos meses em que as duas séries têm valor
   * @param {Array<{data: string, valor: number}>} inflacao Pontos 'mm/aaaa'
   * @param {Array<{data: string, valor: number}>} desocupacao Pontos 'mm/aaaa' (fim do trimestre móvel)
   * @returns {Array<{data: string, valor: number}>} Na ordem da inflação
   */
  static serie(inflacao = [], desocupacao = []) {
    const desocupacaoPorMes = new Map(desocupacao.map(p => [p.data, p.valor]));
    return inflacao
      .filter(p => desocupacaoPorMes.has(p.data))
      .map(p => ({ data: p.data, valor: p.valor + desocupacaoPorMes.get(p.data) }));
  }
}
