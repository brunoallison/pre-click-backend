export type SkillSideEffect = 'read' | 'write';

export interface SkillContext {
  tenantId: string;
  userId: string;
  role: string;
  activeCollectionId?: string;
  selectedStoreId?: string;
  selectedOrderId?: string;
}

export interface Skill<I = unknown, O = unknown> {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>; // JSON Schema
  requires?: 'user' | 'super_admin';
  sideEffect: SkillSideEffect;
  handler(ctx: SkillContext, input: I): Promise<O>;
}

export interface SkillRegistry {
  skills: Skill[];
  get(name: string): Skill | undefined;
  toTools(): Array<{
    name: string;
    description: string;
    input_schema: Record<string, unknown>;
  }>;
}
