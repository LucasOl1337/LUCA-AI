export const BRAZIL_TIME_ZONE = 'America/Sao_Paulo';
export const BRAZIL_LOCALE = 'pt-BR';

const BRAZIL_TIME_OPTIONS = {
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
};

function toValidDate(value = Date.now()) {
  const date = value instanceof Date ? value : new Date(value ?? Date.now());
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

export function formatBrazilTime(value = Date.now(), options = {}) {
  return toValidDate(value).toLocaleTimeString(BRAZIL_LOCALE, {
    ...BRAZIL_TIME_OPTIONS,
    ...options,
    timeZone: BRAZIL_TIME_ZONE,
  });
}

export function formatBrazilDateTime(value = Date.now(), options = {}) {
  return toValidDate(value).toLocaleString(BRAZIL_LOCALE, {
    hour12: false,
    ...options,
    timeZone: BRAZIL_TIME_ZONE,
  });
}
