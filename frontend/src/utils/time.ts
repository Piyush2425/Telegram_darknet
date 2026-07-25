const IST_TIME_ZONE = 'Asia/Kolkata';

type TimeValue = string | number | Date | null | undefined;

const datetimeFormatter = new Intl.DateTimeFormat('en-IN', {
  timeZone: IST_TIME_ZONE,
  year: 'numeric',
  month: 'short',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
});

const dateTimeShortFormatter = new Intl.DateTimeFormat('en-IN', {
  timeZone: IST_TIME_ZONE,
  year: 'numeric',
  month: 'short',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

const dateOnlyFormatter = new Intl.DateTimeFormat('en-IN', {
  timeZone: IST_TIME_ZONE,
  year: 'numeric',
  month: 'short',
  day: '2-digit',
});

export function formatIST(value: TimeValue, fallback = 'Unknown'): string {
  if (value === null || value === undefined || value === '') {
    return fallback;
  }

  if (value instanceof Date) {
    return dateTimeShortFormatter.format(value);
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) {
      return fallback;
    }

    if (/^\d{2}:\d{2}(:\d{2})?$/.test(trimmed)) {
      return `${trimmed.slice(0, 5)} IST`;
    }

    const parsed = Date.parse(trimmed);
    if (!Number.isNaN(parsed)) {
      return dateTimeShortFormatter.format(new Date(parsed));
    }

    return trimmed;
  }

  if (typeof value === 'number') {
    return dateTimeShortFormatter.format(new Date(value));
  }

  return fallback;
}

export function formatISTWithSeconds(value: TimeValue, fallback = 'Unknown'): string {
  if (value === null || value === undefined || value === '') {
    return fallback;
  }

  if (value instanceof Date) {
    return datetimeFormatter.format(value);
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) {
      return fallback;
    }

    if (/^\d{2}:\d{2}(:\d{2})?$/.test(trimmed)) {
      return `${trimmed.slice(0, 5)} IST`;
    }

    const parsed = Date.parse(trimmed);
    if (!Number.isNaN(parsed)) {
      return datetimeFormatter.format(new Date(parsed));
    }

    return trimmed;
  }

  if (typeof value === 'number') {
    return datetimeFormatter.format(new Date(value));
  }

  return fallback;
}

export function formatISTDateOnly(value: TimeValue, fallback = 'Unknown'): string {
  if (value === null || value === undefined || value === '') {
    return fallback;
  }

  if (value instanceof Date) {
    return dateOnlyFormatter.format(value);
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) {
      return fallback;
    }

    const parsed = Date.parse(trimmed);
    if (!Number.isNaN(parsed)) {
      return dateOnlyFormatter.format(new Date(parsed));
    }

    return trimmed;
  }

  if (typeof value === 'number') {
    return dateOnlyFormatter.format(new Date(value));
  }

  return fallback;
}

