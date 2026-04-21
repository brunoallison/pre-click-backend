import { Inject, Injectable } from '../../../utils/di.js';
import { Task, type BaseInput } from '../../../utils/task.js';
import { verifyQuery } from '../../../utils/schema.js';
import { InsightsService } from '../../../services/insights.service.js';
import { DashboardInsightsQuery, type DashboardInsightsOutput } from '../dto/insights.dto.js';

@Injectable()
export class GetDashboardInsightsTask extends Task<DashboardInsightsOutput> {
  protected validations = [verifyQuery(DashboardInsightsQuery)];

  constructor(@Inject(InsightsService) private readonly insights: InsightsService) {
    super();
  }

  async execute(input: BaseInput): Promise<DashboardInsightsOutput> {
    const tenantId = input.headers.tenantId as string;
    const { collection_id } = input.query as DashboardInsightsQuery;

    const insights = await this.insights.forDashboard(tenantId, collection_id);
    return { insights };
  }
}
