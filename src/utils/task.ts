import type { Request, Response, NextFunction, RequestHandler } from 'express';
import { container } from 'tsyringe';
import type { Validator } from './schema.js';
import { logger } from './logger.js';

export interface BaseInput {
  body: unknown;
  query: unknown;
  params: unknown;
  headers: {
    userId?: string;
    tenantId?: string;
    role?: 'super_admin' | 'user';
    [k: string]: unknown;
  };
  file?: Express.Multer.File;
}

export abstract class Task<TOutput> {
  protected validations: Validator[] = [];

  abstract execute(input: BaseInput): Promise<TOutput>;

  protected buildInput(req: Request): BaseInput {
    const authed = req as Request & {
      userId?: string;
      tenantId?: string;
      role?: 'super_admin' | 'user';
    };
    return {
      body: req.body,
      query: req.query,
      params: req.params,
      file: req.file,
      headers: {
        ...req.headers,
        userId: authed.userId,
        tenantId: authed.tenantId,
        role: authed.role,
      },
    };
  }

  public static handler<T extends Task<unknown>>(
    this: new (...args: never[]) => T,
    options?: {
      onResponse?: (result: unknown, req: Request, res: Response) => unknown | Promise<unknown>;
    },
  ): RequestHandler {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const Ctor = this as any;
    return async (req: Request, res: Response, next: NextFunction) => {
      try {
        const task = container.resolve<T>(Ctor);
        for (const validator of task['validations']) {
          await validator(req);
        }
        const result = await task.execute(task['buildInput'](req));
        if (result === undefined || result === null) {
          if (options?.onResponse) await options.onResponse(result, req, res);
          res.status(204).end();
          return;
        }
        const final = options?.onResponse ? await options.onResponse(result, req, res) : result;
        res.json(final);
      } catch (err) {
        next(err);
      }
    };
  }

  public async runAsJobBase(payload: Partial<BaseInput>): Promise<TOutput> {
    const input: BaseInput = {
      body: payload.body ?? {},
      query: payload.query ?? {},
      params: payload.params ?? {},
      headers: payload.headers ?? {},
      file: payload.file,
    };
    logger.debug({ task: this.constructor.name }, 'task: executando como job');
    return this.execute(input);
  }
}
