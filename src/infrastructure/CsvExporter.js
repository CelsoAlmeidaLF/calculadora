/**
 * Camada de Infraestrutura: CsvExporter
 * Exportador de dados tabulares e indicadores macroeconômicos no padrão RFC 4180 com BOM UTF-8.
 */
export class CsvExporter {
  /**
   * Exporta conjunto de métricas para arquivo CSV e dispara download no navegador
   * @param {Object} data Dados para exportação
   * @param {string} [filename='observatorio_macroeconomico_oficial_brasil.csv']
   */
  static export(data, filename = 'observatorio_macroeconomico_oficial_brasil.csv') {
    let csv = "Indicador,Valor,Unidade,Fonte_Oficial\r\n";
    CsvExporter.linhas(data).forEach(([k, v, u, s]) => {
      csv += `${k},${v},${u},${s}\r\n`;
    });

    const blob = new Blob(["\uFEFF" + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  /**
   * Linhas do CSV: indicadores oficiais primeiro; o que vem dos controles do simulador leva o prefixo
   * "Cenario_" e a fonte "Cenario do simulador (nao e dado oficial)".
   * @returns {Array<[string, *, string, string]>}
   */
  static linhas(data) {
    const c = data.cenario || {};
    const origem = "Cenario do simulador (nao e dado oficial)";
    return [
      ["Populacao_Total", data.populacao, "habitantes", "IBGE SIDRA 6579"],
      ["Eleitorado_Apto", data.eleitores, "eleitores", "TSE Eleicoes 2026 (1o turno, inclui exterior)"],
      ["PIB_Nominal_Base", data.pibBaseTri, "Trilhoes_BRL", "Banco Central do Brasil SGS 4382 (PIB 12 meses)"],
      ["Taxa_Meta_Selic", data.selic, "% a.a.", "Banco Central do Brasil SGS 432"],
      ["IPCA_Acumulado_12M", data.ipca, "% a.a.", "Banco Central do Brasil SGS 13522"],
      ["Divida_Bruta_Governo_Geral_DBGG", data.dbgg, "% do PIB", "Banco Central do Brasil SGS 13762"],
      ["Divida_Bruta_Governo_Geral_DBGG_Reais", data.dbggTri, "Trilhoes_BRL", "Banco Central do Brasil SGS 13761"],
      ["Juro_Real_Implicito_Fisher", data.juroReal, "% a.a.", "Calculo Implicito Fisher"],
      ["Juros_Pagos_Uniao_12m", data.custoJurosBi, "Bilhoes_BRL", "Tesouro SICONFI RREO Anexo 01"],
      ["Imposto_Federal_Per_Capita_Ano", data.impostoPerCapita, "BRL/hab", "Impostos e contribuicoes federais / Populacao"],
      ["Juros_Divida_Per_Capita_Ano", data.jurosPerCapita, "BRL/hab", "Juros / Populacao"],
      ...(data.extraRows || []),
      ["Cenario_PIB_Nominal", c.pibBaseTri, "Trilhoes_BRL", origem],
      ["Cenario_Crescimento_Real_PIB", c.pibReal, "% a.a.", origem],
      ["Cenario_Carga_Tributaria_Bruta", c.taxRatio, "% do PIB", origem],
      ["Cenario_Taxa_Selic", c.selic, "% a.a.", origem],
      ["Cenario_IPCA", c.ipca, "% a.a.", origem],
      ["Cenario_Variacao_Real_Gastos", c.spendVariation, "% a.a.", origem],
      ["Cenario_Juro_Real_Fisher", c.juroReal, "% a.a.", origem],
      ["Cenario_Divida_Projetada_Ano_5", c.debtYear5, "% do PIB", origem + ", Modelo Sustentabilidade FMI/Tesouro"]
    ];
  }
}
