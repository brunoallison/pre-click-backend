import { describe, expect, it } from 'vitest';
import { toClickSize } from './click-size-map.js';

describe('toClickSize', () => {
  it.each([
    // Série L
    ['L 2', 'L 2"'],
    ['L 3', 'L 3"'],
    ['L 4', 'L 4"'],
    ['L 5', 'L 5"'],
    ['L 6', 'L 6"'],
    ['L 7', 'L 7"'],
    ['L 8', 'L 8"'],
    ['L 9', 'L 9"'],
    // Série M
    ['M 2', 'M 2"'],
    ['M 3', 'M 3"'],
    ['M 4', 'M 4"'],
    ['M 5', 'M 5"'],
    ['M 6', 'M 6"'],
    ['M 7', 'M 7"'],
    ['M 8', 'M 8"'],
    ['M 9', 'M 9"'],
    // Série S
    ['S 2', 'S 2"'],
    ['S 3', 'S 3"'],
    ['S 4', 'S 4"'],
    ['S 5', 'S 5"'],
    ['S 6', 'S 6"'],
    ['S 7', 'S 7"'],
    ['S 8', 'S 8"'],
    ['S 9', 'S 9"'],
    // M/S
    ['M/S', 'M/S"'],
    // Série XL
    ['XL2', 'XL2"'],
    ['XL3', 'XL3"'],
    ['XL4', 'XL4"'],
    ['XL5', 'XL5"'],
    ['XL6', 'XL6"'],
    ['XL7', 'XL7"'],
    ['XL8', 'XL8"'],
    ['XL9', 'XL9"'],
    // Série XS
    ['XS2', 'XS2"'],
    ['XS3', 'XS3"'],
    ['XS4', 'XS4"'],
    ['XS5', 'XS5"'],
    ['XS6', 'XS6"'],
    ['XS7', 'XS7"'],
    ['XS9', 'XS9"'],
  ])('mapeia %s → %s', (internal, expected) => {
    expect(toClickSize(internal)).toBe(expected);
  });

  it.each([
    // Calçados — passa sem alteração
    ['27', '27'],
    ['36', '36'],
    ['42', '42'],
    ['45 1/3', '45 1/3'],
    // Letras simples — passa sem alteração
    ['S', 'S'],
    ['M', 'M'],
    ['L', 'L'],
    ['XL', 'XL'],
    ['XXL', 'XXL'],
    // Tamanho desconhecido — fallback passthrough
    ['ONESIZE', 'ONESIZE'],
    ['3T', '3T'],
  ])('passa %s sem alteração (fallback)', (internal, expected) => {
    expect(toClickSize(internal)).toBe(expected);
  });
});
