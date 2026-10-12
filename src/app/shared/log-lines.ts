export type LogLevel = 'DEBUG' | 'INFO' | 'WARNING' | 'ERROR' | 'CRITICAL';

export interface LogLine {
  /** Position in the original log, stable across filtering. */
  index: number;
  /** The line as the server sent it, without color codes. */
  raw: string;
  /** The pod it came from, for logs that merge several pods; null otherwise. */
  source: string | null;
  /** When the line was logged; null if it has no timestamp. */
  time: Date | null;
  /** Local time of day with milliseconds, e.g. "22:00:02.130". */
  timeText: string;
  /** Local date and time, for tooltips. */
  fullTime: string;
  /** The line without its timestamp. */
  message: string;
  /** Detected severity; null for plain output. */
  level: LogLevel | null;
}

const LEVELS: Record<string, LogLevel> = {
  DEBUG: 'DEBUG',
  INFO: 'INFO',
  WARN: 'WARNING',
  WARNING: 'WARNING',
  ERROR: 'ERROR',
  CRITICAL: 'CRITICAL',
  FATAL: 'CRITICAL',
};

/** Terminal color and style codes, e.g. "ESC[33m", which some apps write even when not on a terminal. */
// eslint-disable-next-line no-control-regex
const ANSI = /\u001b\[[0-9;?]*[ -/]*[@-~]/g;

/** Merged logs (deployments) start each line with the pod: "[pod-name] <timestamp> …". */
const SOURCE = /^\[([^\]\s]+)\] (?=\d{4}-\d{2}-\d{2}T)/;

/** The server prefixes each line with an RFC 3339 timestamp (nanoseconds). */
const TIMESTAMP = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(\.\d+)?Z ?([\s\S]*)$/;

/** A level word on its own, as in "… - ERROR - …", "[WARNING]" or "ERROR: …". */
const LEVEL_WORD = /(?:^|[\s[(])(DEBUG|INFO|WARN|WARNING|ERROR|CRITICAL|FATAL)(?=[\s\]):-]|$)/;

/** Only the start of a line is searched: long lines are slow to scan and rarely name their level late. */
const LEVEL_SEARCH_CHARS = 200;

/** Go (klog) lines start with a level letter and the date, e.g. "I1012 16:29:45.485712". */
const KLOG = /^([IWEF])\d{4} \d{2}:\d{2}:\d{2}/;
const KLOG_LEVELS: Record<string, LogLevel> = { I: 'INFO', W: 'WARNING', E: 'ERROR', F: 'CRITICAL' };

/** Structured logs: level=error (logfmt) or "level":"error" (JSON). */
const LEVEL_FIELD = /\blevel"?\s*[=:]\s*"?(debug|info|warn|warning|error|fatal|critical)\b/i;

const TRACEBACK = /^Traceback \(most recent call last\)/;
const EXCEPTION = /^[\w.]+(?:Error|Exception)(?::|$)/;

const pad = (n: number, width = 2) => String(n).padStart(width, '0');

/** The part of a pod name that tells replicas apart: "sentiment-nlp-86979d87ff-abcde" → "abcde". */
export function shortSource(source: string): string {
  return source.split('-').at(-1) ?? source;
}

/**
 * Splits raw log lines into time, message and severity. Lines without a level of their
 * own take the previous line's if they're indented, so a traceback stays one error block.
 */
export function parseLog(lines: string[]): LogLine[] {
  let previous: LogLevel | null = null;
  return lines.map((original, index) => {
    let raw = original.replace(ANSI, '');
    const sourceMatch = raw.match(SOURCE);
    const source = sourceMatch ? sourceMatch[1] : null;
    if (sourceMatch) raw = raw.slice(sourceMatch[0].length);
    const match = raw.match(TIMESTAMP);
    let time: Date | null = null;
    let message = raw;
    if (match) {
      const millis = (match[2] ?? '').slice(0, 4).padEnd(4, '0').slice(1);
      const date = new Date(`${match[1]}.${millis}Z`);
      if (!Number.isNaN(date.getTime())) time = date;
      message = match[3];
    }

    const head = message.slice(0, LEVEL_SEARCH_CHARS);
    const found = head.match(LEVEL_WORD);
    const klog = head.match(KLOG);
    const field = head.match(LEVEL_FIELD);
    let level: LogLevel | null = found
      ? LEVELS[found[1]]
      : klog
        ? KLOG_LEVELS[klog[1]]
        : field
          ? LEVELS[field[1].toUpperCase()]
          : null;
    if (!level) {
      if (TRACEBACK.test(message) || EXCEPTION.test(message)) level = 'ERROR';
      else if (/^\s/.test(message)) level = previous;
    }
    previous = level;

    return {
      index,
      raw,
      source,
      time,
      timeText: time
        ? `${pad(time.getHours())}:${pad(time.getMinutes())}:${pad(time.getSeconds())}.${pad(time.getMilliseconds(), 3)}`
        : '',
      fullTime: time ? time.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'long' }) : '',
      message,
      level,
    };
  });
}
