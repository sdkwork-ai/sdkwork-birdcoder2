/**
 * Excel number-format codes.
 *
 * A cell stores a value and a format code; the code decides what the reader
 * sees. Codes carry up to four `;`-separated sections (positive, negative,
 * zero, text), and each section is a run of digit placeholders, date tokens,
 * literals, and directives. Everything here is a pure transformation of
 * (value, code) to the displayed string, so the grid can format a workbook
 * without a layout engine.
 */

/** The four-section split of a format code, before selection. */
interface FormatSections {
  readonly positive: string
  readonly negative?: string
  readonly zero?: string
  readonly text?: string
}

/** Date and time components a serial number resolves to. */
interface DateParts {
  readonly year: number
  /** 1-based month, so 2 is February. */
  readonly month: number
  readonly day: number
  readonly weekday: number
  readonly hours: number
  readonly minutes: number
  readonly seconds: number
  /** Whole days, for elapsed-time tokens. */
  readonly totalDays: number
}

/** Milliseconds in one day. */
const MS_PER_DAY = 86400000

/**
 * Split a format code into its sections, ignoring separators inside literals.
 * @param code - the raw format code.
 * @returns the sections, in order.
 */
function splitSections(code: string): readonly string[] {
  const sections: string[] = []
  let current = ''
  let inQuotes = false
  let inBracket = false
  for (let index = 0; index < code.length; index += 1) {
    const character = code[index] ?? ''
    if (character === '"' && !inBracket) inQuotes = !inQuotes
    else if (character === '[' && !inQuotes) inBracket = true
    else if (character === ']' && !inQuotes) inBracket = false
    else if (character === '\\') {
      current += character
      index += 1
      current += code[index] ?? ''
      continue
    }
    if (character === ';' && !inQuotes && !inBracket) {
      sections.push(current)
      current = ''
      continue
    }
    current += character
  }
  sections.push(current)
  return sections
}

/**
 * Read the up-to-four sections of a format code.
 * @param code - the raw format code.
 * @returns the named sections.
 */
function readSections(code: string): FormatSections {
  const sections = splitSections(code)
  const [first = '', second, third, fourth] = sections
  return {
    positive: first,
    ...(sections.length >= 2 ? { negative: second } : {}),
    ...(sections.length >= 3 ? { zero: third } : {}),
    ...(sections.length >= 4 ? { text: fourth } : {}),
  }
}

/** Whether a format code is the general-purpose placeholder. */
function isGeneral(code: string): boolean {
  return code.trim().toLowerCase() === 'general' || code.trim() === ''
}

/**
 * Walk a section, yielding each meaningful token with its literal text.
 * @param section - one section of a format code.
 * @returns tokens in order: `token` names a code, `literal` carries text.
 */
function tokenize(section: string): readonly { readonly kind: 'token' | 'literal'; readonly value: string }[] {
  const tokens: { kind: 'token' | 'literal'; value: string }[] = []
  for (let index = 0; index < section.length; index += 1) {
    const character = section[index] ?? ''
    if (character === '"') {
      let text = ''
      index += 1
      while (index < section.length && section[index] !== '"') {
        text += section[index]
        index += 1
      }
      tokens.push({ kind: 'literal', value: text })
      continue
    }
    if (character === '\\') {
      index += 1
      tokens.push({ kind: 'literal', value: section[index] ?? '' })
      continue
    }
    if (character === '_') {
      // `_x` reserves the width of one character; a space is the closest CSS-free stand-in.
      index += 1
      tokens.push({ kind: 'literal', value: ' ' })
      continue
    }
    if (character === '*') {
      // `*x` repeats x to fill the cell width, which the grid does not model.
      index += 1
      continue
    }
    if (character === '[') {
      const close = section.indexOf(']', index)
      const body = close < 0 ? section.slice(index + 1) : section.slice(index + 1, close)
      index = close < 0 ? section.length : close
      const lower = body.toLowerCase()
      if (lower === 'h' || lower === 'hh' || lower === 'm' || lower === 'mm' || lower === 's' || lower === 'ss') {
        tokens.push({ kind: 'token', value: `[${lower}]` })
      }
      // Colour and condition brackets affect styling, not the text the cell shows.
      continue
    }
    // `am/pm` and `a/p` are single tokens, and a run of one date letter is one
    // token too, so `yyyy` is a four-letter year and `mm` is not two months.
    const rest = section.slice(index).toLowerCase()
    if (rest.startsWith('am/pm')) {
      tokens.push({ kind: 'token', value: 'am/pm' })
      index += 4
      continue
    }
    if (rest.startsWith('a/p')) {
      tokens.push({ kind: 'token', value: 'a/p' })
      index += 2
      continue
    }
    if (/[ymdhs]/i.test(character)) {
      let run = character
      while (index + 1 < section.length && section[index + 1]?.toLowerCase() === character.toLowerCase()) {
        run += section[index + 1]
        index += 1
      }
      tokens.push({ kind: 'token', value: run.toLowerCase() })
      continue
    }
    tokens.push({ kind: 'token', value: character })
  }
  return tokens
}

/** Token names that make a section a date or time format. */
const DATE_TOKENS = /^(?:y{1,5}|m{1,5}|d{1,4}|h{1,2}|s{1,2}|am\/pm|a\/p|\[(?:h|hh|m|mm|s|ss)\])$/i

/**
 * Whether a format code renders its value as a date or time.
 * @param code - the raw format code.
 * @returns true when any section holds a date or time token.
 */
export function isDateFormat(code: string): boolean {
  if (isGeneral(code)) return false
  return splitSections(code).some(section => tokenize(section)
    .some(token => token.kind === 'token' && DATE_TOKENS.test(token.value)))
}

/**
 * Resolve a workbook serial number to date and time components.
 * @param serial - the stored numeric value.
 * @param date1904 - whether the workbook uses the 1904 date system.
 * @returns the resolved components.
 */
export function serialToDateParts(serial: number, date1904: boolean): DateParts {
  const totalDays = Math.floor(serial)
  // Excel's 1900 system counts a non-existent 1900-02-29, so serials at or
  // below 60 sit one day earlier than the epoch arithmetic would place them.
  const leapBugShift = !date1904 && totalDays >= 61 ? -1 : 0
  const base = date1904
    ? Date.UTC(1904, 0, 1)
    : Date.UTC(1899, 11, 31)
  const dayMs = base + (totalDays + leapBugShift) * MS_PER_DAY
  const fractionSeconds = Math.round((serial - totalDays) * 86400)
  const date = new Date(dayMs)
  const isPhantomLeapDay = !date1904 && totalDays === 60
  return {
    year: isPhantomLeapDay ? 1900 : date.getUTCFullYear(),
    month: isPhantomLeapDay ? 2 : date.getUTCMonth() + 1,
    day: isPhantomLeapDay ? 29 : date.getUTCDate(),
    weekday: isPhantomLeapDay ? 3 : date.getUTCDay(),
    hours: Math.floor(fractionSeconds / 3600) % 24,
    minutes: Math.floor(fractionSeconds / 60) % 60,
    seconds: fractionSeconds % 60,
    totalDays,
  }
}

/** Month names for the `mmm` and `mmmm` tokens. */
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December']
/** Weekday names for the `ddd` and `dddd` tokens, indexed from Sunday. */
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

/** Pad a number to a fixed width. */
function pad(value: number, width: number): string {
  return String(Math.abs(Math.trunc(value))).padStart(width, '0')
}

/**
 * Render the date and time a serial number represents.
 * @param serial - the stored numeric value.
 * @param section - the selected format section.
 * @param date1904 - whether the workbook uses the 1904 date system.
 * @returns the formatted text.
 */
function formatDateTime(serial: number, section: string, date1904: boolean): string {
  const parts = serialToDateParts(serial, date1904)
  const tokens = tokenize(section)
  const DATE_LETTER = /^(?:y{1,5}|m{1,5}|d{1,4}|h{1,2}|s{1,2}|\[[hms]+\])$/i
  // `m` is minutes when the nearest date token before it counts hours or the
  // nearest one after it counts seconds; separators like `:` do not decide it.
  const dateIndexes = tokens
    .map((token, index) => (token.kind === 'token' && DATE_LETTER.test(token.value) ? index : -1))
    .filter(index => index >= 0)
  const isMinute = (index: number): boolean => {
    const previous = dateIndexes.filter(candidate => candidate < index).at(-1)
    const next = dateIndexes.find(candidate => candidate > index)
    const previousValue = previous === undefined ? '' : (tokens[previous]?.value ?? '')
    const nextValue = next === undefined ? '' : (tokens[next]?.value ?? '')
    return /^\[?h/i.test(previousValue) || /^\[?s/i.test(nextValue)
  }
  let text = ''
  let hourWidth = 1
  let sawAmPm = false
  for (const [index, token] of tokens.entries()) {
    if (token.kind === 'literal') {
      text += token.value
      continue
    }
    const lower = token.value.toLowerCase()

    switch (lower) {
      case 'yy': text += pad(parts.year % 100, 2); break
      case 'yyy': text += pad(parts.year, 3); break
      case 'yyyy': text += pad(parts.year, 4); break
      case 'y': text += String(parts.year); break
      case 'mmmmm': text += (MONTHS[parts.month - 1] ?? '').slice(0, 1); break
      case 'mmmm': text += MONTHS[parts.month - 1] ?? ''; break
      case 'mmm': text += (MONTHS[parts.month - 1] ?? '').slice(0, 3); break
      case 'mm':
        // `mm` is minutes when it follows hours or precedes seconds, months otherwise.
        text += isMinute(index) ? pad(parts.minutes, 2) : pad(parts.month, 2)
        break
      case 'm':
        text += isMinute(index) ? String(parts.minutes) : String(parts.month)
        break
      case 'dddd': text += WEEKDAYS[parts.weekday] ?? ''; break
      case 'ddd': text += (WEEKDAYS[parts.weekday] ?? '').slice(0, 3); break
      case 'dd': text += pad(parts.day, 2); break
      case 'd': text += String(parts.day); break
      case 'hh': hourWidth = 2; text += pad(parts.hours, 2); break
      case 'h': hourWidth = 1; text += String(parts.hours); break
      case 'ss': text += pad(parts.seconds, 2); break
      case 's': text += String(parts.seconds); break
      case 'am/pm':
      case 'a/p':
        text += parts.hours < 12
          ? (lower === 'a/p' ? 'A' : 'AM')
          : (lower === 'a/p' ? 'P' : 'PM')
        sawAmPm = true
        break
      case '[h]': text += String(parts.totalDays * 24 + parts.hours); break
      case '[hh]': text += pad(parts.totalDays * 24 + parts.hours, 2); break
      case '[m]': text += String(parts.totalDays * 1440 + parts.hours * 60 + parts.minutes); break
      case '[mm]': text += pad(parts.totalDays * 1440 + parts.hours * 60 + parts.minutes, 2); break
      case '[s]': text += String(parts.totalDays * 86400 + parts.hours * 3600 + parts.minutes * 60 + parts.seconds); break
      case '[ss]': text += pad(parts.totalDays * 86400 + parts.hours * 3600 + parts.minutes * 60 + parts.seconds, 2); break
      default: text += token.value; break
    }

  }
  if (sawAmPm) {
    // The twelve-hour clock: 0 and 12 both read as twelve, padded to the width
    // the section's own hour token asked for.
    const hour12 = parts.hours % 12 === 0 ? 12 : parts.hours % 12
    text = text.replace(/\b0?(\d{1,2})\b/, (match, captured: string) => (
      Number(captured) === parts.hours ? pad(hour12, hourWidth) : match
    ))
  }
  return text
}

/**
 * Render a number with Excel's general-purpose rules.
 *
 * General shows at most eleven significant digits, drops trailing zeros, and
 * falls back to scientific notation when the magnitude needs it.
 * @param value - the numeric value.
 * @returns the displayed text.
 */
export function formatGeneral(value: number): string {
  if (!Number.isFinite(value)) return String(value)
  if (value === 0) return '0'
  const magnitude = Math.abs(value)
  if (magnitude >= 1e11 || magnitude < 1e-10) {
    const exponential = value.toExponential(5)
    const [mantissa = '0', exponent = ''] = exponential.split('e')
    return `${Number(mantissa)}E${exponent.startsWith('-') ? '-' : '+'}${exponent.replace(/^[+-]/, '').padStart(2, '0')}`
  }
  const rounded = Number(value.toPrecision(11))
  return String(rounded)
}

/** The digit pattern a numeric section renders with. */
interface NumericPattern {
  readonly prefix: string
  readonly suffix: string
  readonly minimumIntegerDigits: number
  readonly decimalPlaces: number
  /** Decimal places a `#` or `?` occupies, which are dropped when they are zero. */
  readonly optionalDecimalPlaces: number
  readonly grouped: boolean
  readonly scale: number
  readonly scientific: boolean
}

/**
 * Read the digit pattern a numeric section describes.
 * @param section - the selected format section.
 * @returns the pattern, or undefined when the section holds no digit placeholder.
 */
function readNumericPattern(section: string): NumericPattern | undefined {
  const tokens = tokenize(section)
  const firstDigit = tokens.findIndex(token => token.kind === 'token' && /[0#?]/.test(token.value))
  if (firstDigit < 0) return undefined
  const lastDigit = tokens.reduce((found, token, index) => (
    token.kind === 'token' && /[0#?%]/.test(token.value) ? index : found
  ), firstDigit)
  // Commas directly after the last digit placeholder scale the value, so they
  // belong to the run rather than to the surrounding literal text.
  let runEnd = lastDigit
  while (tokens[runEnd + 1]?.kind === 'token' && tokens[runEnd + 1]?.value === ',') runEnd += 1
  const prefix = tokens.slice(0, firstDigit).map(token => token.value).join('')
  const suffix = tokens.slice(runEnd + 1).map(token => token.value).join('')
  const run = tokens.slice(firstDigit, runEnd + 1)
  let seenDecimalPoint = false
  let minimumIntegerDigits = 0
  let decimalPlaces = 0
  let optionalDecimalPlaces = 0
  let grouped = false
  let scale = 1
  let percentCount = 0
  let scientific = false
  for (const [index, token] of run.entries()) {
    if (token.kind !== 'token') continue
    const character = token.value
    if (character === '.') {
      seenDecimalPoint = true
      continue
    }
    if (character === ',') {
      // A comma that closes the run scales the value by a thousand; one between
      // digit placeholders is the thousands separator.
      const previous = run.at(index - 1)
      const next = run.at(index + 1)
      const closesRun = next === undefined || next.value === '.' || next.value === ','
      const followsDigit = previous !== undefined && /[0#?]/.test(previous.value)
      if (!seenDecimalPoint && closesRun && followsDigit) scale /= 1000
      else grouped = true
      continue
    }
    if (character === '%') {
      scale *= 100
      percentCount += 1
      continue
    }
    if (character === 'E' || character === 'e') {
      scientific = true
      continue
    }
    if (character === '+' || character === '-') continue
    if (/[0#?]/.test(character)) {
      if (seenDecimalPoint) {
        decimalPlaces += 1
        if (character !== '0') optionalDecimalPlaces += 1
      } else if (character === '0') {
        minimumIntegerDigits += 1
      }
    }
  }
  return {
    prefix,
    suffix: '%'.repeat(percentCount) + suffix,
    minimumIntegerDigits,
    decimalPlaces,
    optionalDecimalPlaces,
    grouped,
    scale,
    scientific,
  }
}

/** Insert thousands separators into a digit string. */
function group(digits: string): string {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

/**
 * Render a number with one section of a format code.
 * @param value - the numeric value, already made non-negative where the section expects it.
 * @param section - the selected format section.
 * @returns the formatted text, or undefined when the section has no digit pattern.
 */
function formatWithSection(value: number, section: string): string | undefined {
  const pattern = readNumericPattern(section)
  if (pattern === undefined) {
    // A section with no digit placeholder shows only its own literal text,
    // which is how a `"zero"` or `"N/A"` section works.
    const literal = tokenize(section).map(token => token.value).join('')
    return literal === '' ? undefined : literal
  }
  const scaled = value * pattern.scale
  if (pattern.scientific) {
    const exponential = scaled.toExponential(pattern.decimalPlaces)
    const [mantissa = '0', exponent = ''] = exponential.split('e')
    const sign = exponent.startsWith('-') ? '-' : '+'
    return `${pattern.prefix}${mantissa}E${sign}${exponent.replace(/^[+-]/, '').padStart(2, '0')}${pattern.suffix}`
  }
  const fixed = scaled.toFixed(pattern.decimalPlaces)
  const [rawInteger = '0'] = fixed.split('.')
  const rawFraction = fixed.split('.').at(1)
  // `#` pads nothing, so a value below one loses its leading zero.
  const padded = pattern.minimumIntegerDigits === 0 && rawInteger === '0' && pattern.decimalPlaces > 0
    ? ''
    : rawInteger.padStart(pattern.minimumIntegerDigits, '0')
  const integer = pattern.grouped ? group(padded) : padded
  const requiredDecimals = pattern.decimalPlaces - pattern.optionalDecimalPlaces
  const trimmed = (pattern.optionalDecimalPlaces === 0
    ? rawFraction ?? ''
    : (rawFraction ?? '').replace(new RegExp(`0{1,${pattern.optionalDecimalPlaces}}$`), ''))
    .padEnd(requiredDecimals, '0')
  const fraction = trimmed === '' ? '' : `.${trimmed}`
  return `${pattern.prefix}${integer}${fraction}${pattern.suffix}`
}

/**
 * Render a value as the reader should see it.
 * @param value - the stored value: a number, or text for a text cell.
 * @param code - the cell's format code; `General` when the cell states none.
 * @param date1904 - whether the workbook uses the 1904 date system.
 * @returns the displayed text.
 */
export function formatCellValue(
  value: number | string | boolean,
  code: string,
  date1904 = false,
): string {
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE'
  if (typeof value === 'string') {
    const sections = readSections(code)
    if (sections.text !== undefined) {
      const literal = tokenize(sections.text).map(token => token.value).join('')
      return literal.replace(/@/g, value)
    }
    return value
  }
  if (isGeneral(code)) return formatGeneral(value)
  const sections = readSections(code)
  if (isDateFormat(code)) {
    const section = value < 0 && sections.negative !== undefined
      ? sections.negative
      : value === 0 && sections.zero !== undefined ? sections.zero : sections.positive
    return formatDateTime(Math.abs(value), section, date1904)
  }
  if (value > 0) {
    return formatWithSection(value, sections.positive) ?? formatGeneral(value)
  }
  if (value < 0) {
    if (sections.negative !== undefined) {
      return formatWithSection(-value, sections.negative) ?? formatGeneral(value)
    }
    return `-${formatWithSection(-value, sections.positive) ?? formatGeneral(-value)}`
  }
  return formatWithSection(0, sections.zero ?? sections.positive) ?? formatGeneral(0)
}
