import type { Request } from 'express';
import { plainToInstance } from 'class-transformer';
import { validate, type ValidatorOptions } from 'class-validator';
import { HttpError } from './error.js';

type Ctor<T> = new () => T;

export type Validator = (req: Request) => Promise<void>;

const OPTIONS: ValidatorOptions = {
  whitelist: true,
  forbidNonWhitelisted: true,
  forbidUnknownValues: true,
};

async function runValidation<T extends object>(
  cls: Ctor<T>,
  payload: unknown,
  label: 'body' | 'query' | 'params',
): Promise<T> {
  const instance = plainToInstance(cls, payload ?? {}, { enableImplicitConversion: true });
  const errors = await validate(instance as object, OPTIONS);
  if (errors.length > 0) {
    throw HttpError.BadRequest('validation_failed', `Falha de validação em ${label}`, {
      fields: errors.map((e) => ({
        property: e.property,
        constraints: e.constraints,
      })),
    });
  }
  return instance;
}

export function verifyBody<T extends object>(cls: Ctor<T>, _strict = true): Validator {
  return async (req) => {
    (req as Request & { validatedBody: T }).validatedBody = await runValidation(
      cls,
      req.body,
      'body',
    );
  };
}

export function verifyQuery<T extends object>(cls: Ctor<T>): Validator {
  return async (req) => {
    (req as Request & { validatedQuery: T }).validatedQuery = await runValidation(
      cls,
      req.query,
      'query',
    );
  };
}

export function verifyParams<T extends object>(cls: Ctor<T>): Validator {
  return async (req) => {
    (req as Request & { validatedParams: T }).validatedParams = await runValidation(
      cls,
      req.params,
      'params',
    );
  };
}
