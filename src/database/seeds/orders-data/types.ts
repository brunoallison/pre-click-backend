// Tipos compartilhados entre os datasets de simulação. Apagar junto com os
// arquivos *.data.ts e a migration depois da simulação.
export interface SimRow {
  rdd: string;
  customer: string;
  article: string;
  qty: number;
  size: string;
}

export interface SimDataset {
  batchName: string;
  collection: string;
  rows: SimRow[];
}
