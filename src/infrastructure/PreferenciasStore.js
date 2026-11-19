/**
 * Camada de Infraestrutura: PreferenciasStore
 * Guarda no próprio navegador as escolhas da pessoa que valem para as próximas visitas.
 * Nada sai do aparelho.
 */
const BASES = ['populacao', 'eleitores'];

export class PreferenciasStore {
  /**
   * @param {Object} [options]
   * @param {string} [options.chave] Chave no localStorage
   * @param {Storage} [options.storage] Armazenamento (padrão: window.localStorage)
   */
  constructor({ chave = 'calculadora.base', storage } = {}) {
    this.chave = chave;
    try {
      this.storage = storage || globalThis.localStorage || null;
    } catch {
      this.storage = null; // navegação privada ou armazenamento bloqueado
    }
  }

  /** @returns {'populacao'|'eleitores'|null} null quando a pessoa nunca escolheu ou o valor salvo não vale */
  lerBase() {
    try {
      const salva = this.storage && this.storage.getItem(this.chave);
      return BASES.includes(salva) ? salva : null;
    } catch {
      return null;
    }
  }

  /** @param {'populacao'|'eleitores'} base */
  salvarBase(base) {
    if (!BASES.includes(base)) return;
    try {
      if (this.storage) this.storage.setItem(this.chave, base);
    } catch {
      /* sem espaço ou bloqueado: vale só nesta visita */
    }
  }
}
