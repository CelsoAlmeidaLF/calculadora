/**
 * Camada de UI: PreferenciasPainel
 * Seção "Cálculos" do painel de configurações. Os controles de simulação ficam na tela,
 * junto do resultado: aqui entra só o que vale para as próximas visitas.
 */
import { grupoDeOpcoes } from '../../vendor/stk-gov/stk-gov-config.js?v=20261119-1317';

/**
 * @param {Object} deps
 * @param {import('../infrastructure/PreferenciasStore.js?v=20261119-1317').PreferenciasStore} deps.preferencias
 * @param {import('../application/MacroObservatoryService.js?v=20261119-1317').MacroObservatoryService} deps.service
 */
export function secaoCalculos({ preferencias, service }) {
  return {
    titulo: 'Cálculos',
    montar(corpo) {
      corpo.append(grupoDeOpcoes({
        nome: 'stkBase',
        legenda: 'Ao abrir o app, dividir os valores',
        itens: [{ valor: 'populacao', rotulo: 'Por habitante' }, { valor: 'eleitores', rotulo: 'Por eleitor' }],
        selecionado: preferencias.lerBase() || 'populacao',
        aoMudar: base => {
          preferencias.salvarBase(base);
          service.setBaseCalculo(base);
        }
      }));
      const nota = document.createElement('p');
      nota.className = 'stk-config-texto';
      nota.textContent = 'Um link de cenário recebido de outra pessoa continua abrindo com a base escolhida por ela.';
      corpo.append(nota);
    }
  };
}
