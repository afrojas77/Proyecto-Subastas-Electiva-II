import { describe, expect, it } from '@jest/globals';

import { InvalidDomainValueError } from '../errors/invalid-domain-value.error';
import { InvalidEmailError } from '../errors/invalid-email.error';
import { InvalidMoneyError } from '../errors/invalid-money.error';
import { AuctionStatus } from './auction-status';
import { Email } from './email';
import { Money } from './money';

describe('Money', () => {
  it('representa pesos colombianos enteros y no negativos', () => {
    const money = new Money(25_000);
    expect(money.amount).toBe(25_000);
    expect(money.currency).toBe('COP');
  });

  it('rechaza valores negativos', () => {
    expect(() => new Money(-1)).toThrow(InvalidMoneyError);
  });

  it('rechaza valores decimales', () => {
    expect(() => new Money(1.5)).toThrow(InvalidMoneyError);
  });
});

describe('Email', () => {
  it('acepta y normaliza un correo válido', () => {
    expect(new Email(' Usuario@Ejemplo.com ').value).toBe(
      'usuario@ejemplo.com',
    );
  });

  it('rechaza un correo inválido', () => {
    expect(() => new Email('correo-invalido')).toThrow(InvalidEmailError);
  });
});

describe('AuctionStatus', () => {
  it.each(['OPEN', 'CANCELLED', 'CLOSED', 'DESERTED', 'DEFAULTED'])(
    'acepta el estado válido %s',
    (status) => {
      expect(AuctionStatus.from(status).value).toBe(status);
    },
  );

  it('rechaza un estado desconocido', () => {
    expect(() => AuctionStatus.from('UNKNOWN')).toThrow(
      InvalidDomainValueError,
    );
  });
});
