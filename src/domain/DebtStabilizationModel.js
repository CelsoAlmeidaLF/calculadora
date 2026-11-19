/**
 * Camada de Domínio: superávit primário que estabiliza a dívida (spec novos-calculos-macro, 3.1)
 *
 * Mesma dinâmica de DebtTrajectoryModel: Δd = d · (r − g) / (1 + g) − s.
 * A dívida fica parada (Δd = 0) quando o primário é s* = d · (r − g) / (1 + g).
 * Função pura: recebe números (em pontos percentuais) e devolve números. Quem monta os insumos e o selo é a aplicação.
 */
export class DebtStabilizationModel {
  /**
   * @param {Object} params
   * @param {number} params.dividaPctPib Dívida bruta (DBGG) em % do PIB (d)
   * @param {number} params.jurosRealPct Juro real em % a.a. (r), ex.: FisherModel.calculateRealRate(selic, ipca)
   * @param {number} params.crescimentoRealPct Crescimento real do PIB em % a.a. (g)
   * @param {number} [params.primarioSimuladoPct] Primário do cenário em % do PIB; se vier, calcula a diferença
   * @returns {{valor: {primarioPct: number, diferencaPp?: number}, formulaExata: boolean, avisos: string[]}}
   *   primarioPct > 0: superávit necessário; < 0: a dívida cai mesmo com déficit.
   *   diferencaPp = primário simulado − estabilizador (positivo: a dívida cai no cenário).
   *   formulaExata é false: g e r são premissas de cenário.
   * @throws {RangeError} entrada não finita, dívida negativa, g ≤ −100% ou r ≤ −100%
   */
  static primarioEstabilizador({ dividaPctPib, jurosRealPct, crescimentoRealPct, primarioSimuladoPct }) {
    const verificar = (valor, nome) => {
      if (typeof valor !== 'number' || !Number.isFinite(valor)) throw new RangeError(`${nome} deve ser um número finito`);
    };
    verificar(dividaPctPib, 'A dívida (% do PIB)');
    verificar(jurosRealPct, 'O juro real');
    verificar(crescimentoRealPct, 'O crescimento real do PIB');
    if (dividaPctPib < 0) throw new RangeError('A dívida (% do PIB) não pode ser negativa');
    if (crescimentoRealPct <= -100) throw new RangeError('O crescimento real do PIB deve ser maior que -100%');
    if (jurosRealPct <= -100) throw new RangeError('O juro real deve ser maior que -100%');

    const r = jurosRealPct / 100;
    const g = crescimentoRealPct / 100;
    const primarioPct = dividaPctPib * (r - g) / (1 + g);

    const valor = { primarioPct };
    if (primarioSimuladoPct !== undefined) {
      verificar(primarioSimuladoPct, 'O primário simulado');
      valor.diferencaPp = primarioSimuladoPct - primarioPct;
    }
    return { valor, formulaExata: false, avisos: [] };
  }
}
