import ExcelJS from 'exceljs';
import { Injectable } from '../../utils/di.js';
import { toClickSize } from './click-size-map.js';

export interface ClickRow {
  sold_to: number;
  nome_cliente: string;
  divisao: string | null;
  genero: string | null;
  grupo_produto: string | null;
  categoria: string | null;
  tipo_produto: string | null;
  article: string;
  article_name: string;
  color: string | null;
  image_url: string | null;
  ean: number | null;
  upc: number | null;
  data_inicial: number | null;
  data_final: number | null;
  rdd: number;
  tamanho: string;
  pb: number | null;
  pdv: number;
  currency: string;
  inventory: string | null;
  total_qty: number;
  observacoes: string | null;
  qty: number;
}

export interface ClickWriterMeta {
  cart_name: string;
  nome_destinatario: string;
  numero_destinatario: string;
}

const HEADERS = [
  'Sold To',
  'Nome do Cliente',
  'Divisão',
  'Gênero de produto',
  'Grupo de produto',
  'Categoria',
  'Tipo Produto',
  'Article Number',
  'Article Name',
  'Color',
  'Image',
  'EAN',
  'UPC',
  'Data inicial do pedido',
  'Data final do pedido',
  'Requested Delivery Date',
  'Tamanho',
  'PB',
  'PDV',
  'Currency',
  'Inventory',
  'Total Qty',
  'Observações',
  'Qty',
];

@Injectable()
export class ClickWriterProvider {
  async write(rows: ClickRow[], meta: ClickWriterMeta): Promise<Buffer> {
    const wb = new ExcelJS.Workbook();
    const sheet = wb.addWorksheet('CLICK');

    sheet.getCell('W1').value = 'Cart Name';
    sheet.getCell('X1').value = meta.cart_name;
    sheet.getCell('W2').value = 'Nome do Destinatário';
    sheet.getCell('X2').value = meta.nome_destinatario;
    sheet.getCell('W3').value = 'Número do Destinatário';
    sheet.getCell('X3').value = meta.numero_destinatario;

    const headerRow = sheet.getRow(4);
    HEADERS.forEach((h, i) => {
      headerRow.getCell(i + 1).value = h;
    });
    headerRow.font = { bold: true };

    rows.forEach((r, idx) => {
      const row = sheet.getRow(5 + idx);
      row.getCell(1).value = r.sold_to; // A numérico
      row.getCell(2).value = r.nome_cliente;
      row.getCell(3).value = r.divisao;
      row.getCell(4).value = r.genero;
      row.getCell(5).value = r.grupo_produto;
      row.getCell(6).value = r.categoria;
      row.getCell(7).value = r.tipo_produto;
      row.getCell(8).value = r.article;
      row.getCell(9).value = r.article_name;
      row.getCell(10).value = r.color;
      row.getCell(11).value = r.image_url;
      row.getCell(12).value = r.ean;
      row.getCell(13).value = r.upc;
      row.getCell(14).value = r.data_inicial;
      row.getCell(15).value = r.data_final;
      row.getCell(16).value = r.rdd; // P numérico
      row.getCell(17).value = toClickSize(r.tamanho); // Q — aplica mapeamento interno → Click
      row.getCell(18).value = r.pb;
      row.getCell(19).value = r.pdv;
      row.getCell(20).value = r.currency;
      row.getCell(21).value = r.inventory;
      row.getCell(22).value = r.total_qty;
      row.getCell(23).value = r.observacoes;
      row.getCell(24).value = r.qty; // X numérico — principal
    });

    const arr = await wb.xlsx.writeBuffer();
    return Buffer.from(arr as ArrayBuffer);
  }
}
