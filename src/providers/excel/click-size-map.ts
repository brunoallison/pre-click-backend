/**
 * Mapeamento de tamanhos internos → formato Click (Adidas).
 *
 * Tamanhos de vestuário com comprimento numérico em polegadas (ex: L 2, XL3, XS2, M/S)
 * recebem sufixo `"` no Click. Calçados e tamanhos textuais simples passam sem alteração.
 *
 * Fonte: UPLOAD CLICK.xlsm > aba `subs` (40 mapeamentos fixos).
 */
const SIZE_MAP: Readonly<Record<string, string>> = {
  'L 2': 'L 2"',
  'L 3': 'L 3"',
  'L 4': 'L 4"',
  'L 5': 'L 5"',
  'L 6': 'L 6"',
  'L 7': 'L 7"',
  'L 8': 'L 8"',
  'L 9': 'L 9"',
  'M 2': 'M 2"',
  'M 3': 'M 3"',
  'M 4': 'M 4"',
  'M 5': 'M 5"',
  'M 6': 'M 6"',
  'M 7': 'M 7"',
  'M 8': 'M 8"',
  'M 9': 'M 9"',
  'S 2': 'S 2"',
  'S 3': 'S 3"',
  'S 4': 'S 4"',
  'S 5': 'S 5"',
  'S 6': 'S 6"',
  'S 7': 'S 7"',
  'S 8': 'S 8"',
  'S 9': 'S 9"',
  'M/S': 'M/S"',
  XL2: 'XL2"',
  XL3: 'XL3"',
  XL4: 'XL4"',
  XL5: 'XL5"',
  XL6: 'XL6"',
  XL7: 'XL7"',
  XL8: 'XL8"',
  XL9: 'XL9"',
  XS2: 'XS2"',
  XS3: 'XS3"',
  XS4: 'XS4"',
  XS5: 'XS5"',
  XS6: 'XS6"',
  XS7: 'XS7"',
  XS9: 'XS9"',
};

/**
 * Converte tamanho interno para o formato usado no Click (col Q do export).
 *
 * Aplica a tabela de 40 mapeamentos fixos.
 * Fallback: retorna o valor como está (calçados e letras simples como S, M, XL não precisam sufixo).
 */
export function toClickSize(internal: string): string {
  return SIZE_MAP[internal] ?? internal;
}
