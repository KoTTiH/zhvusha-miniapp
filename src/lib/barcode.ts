// Утилиты для штрих-кодов: нормализация форматов и проверка контрольной суммы.
// Поддержаны EAN-13, EAN-8, UPC-A (12 цифр, приводится к EAN-13 добавлением ведущего нуля).

const FNC1 = String.fromCharCode(29)

export function normalizeBarcode(raw: string): string {
  let s = raw.trim()
  // GS1 Data Matrix ECI-префиксы
  if (s.startsWith(']d2') || s.startsWith(']C1')) s = s.slice(3)
  if (s.startsWith(FNC1)) s = s.slice(1)
  // GS1 Application Identifier "01" — GTIN-14
  const gs1 = s.match(/^01(\d{14})/)
  if (gs1) s = gs1[1]
  if (!/^\d+$/.test(s)) return raw.trim()
  // GTIN-14 с ведущим нулём → EAN-13
  if (s.length === 14 && s.startsWith('0')) return s.slice(1)
  // UPC-A (12) → EAN-13
  if (s.length === 12) return '0' + s
  return s
}

export function isValidEan(code: string): boolean {
  if (!/^\d+$/.test(code)) return false
  if (code.length === 13) return eanChecksumOk(code, true)
  if (code.length === 8) return eanChecksumOk(code, false)
  return false
}

function eanChecksumOk(code: string, isEan13: boolean): boolean {
  const digits = code.split('').map((c) => Number(c))
  const last = digits[digits.length - 1]
  let sum = 0
  for (let i = 0; i < digits.length - 1; i++) {
    const mult = isEan13 ? (i % 2 === 0 ? 1 : 3) : (i % 2 === 0 ? 3 : 1)
    sum += digits[i] * mult
  }
  const check = (10 - (sum % 10)) % 10
  return check === last
}
