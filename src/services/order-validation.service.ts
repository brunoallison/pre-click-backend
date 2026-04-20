import { Injectable } from '../utils/di.js';

export interface OrderValidation {
  blockers: Array<{ code: string; message: string; context?: object }>;
  warnings: Array<{ code: string; message: string; context?: object }>;
}

@Injectable()
export class OrderValidationService {
  // Placeholder: implementação real nas Tasks de export.
  validateForExport(): OrderValidation {
    return { blockers: [], warnings: [] };
  }
}
