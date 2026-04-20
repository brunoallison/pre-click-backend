import { Injectable } from '../utils/di.js';

@Injectable()
export class EtagService {
  fromDate(d: Date): string {
    return `"${d.getTime()}"`;
  }
}
