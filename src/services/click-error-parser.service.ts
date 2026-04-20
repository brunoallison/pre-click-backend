import { Inject, Injectable } from '../utils/di.js';
import type { ParsedClickError } from '../providers/excel/error-parser.provider.js';
import { ErrorParserProvider } from '../providers/excel/error-parser.provider.js';

@Injectable()
export class ClickErrorParserService {
  constructor(@Inject(ErrorParserProvider) private readonly parser: ErrorParserProvider) {}

  parse(buffer: Buffer): Promise<ParsedClickError[]> {
    return this.parser.parse(buffer);
  }
}
