import { normalizeBarcode } from '../src/lib/barcode.ts'

const FNC1 = String.fromCharCode(29)

const cases = [
  {
    name: 'EAN-13 остаётся без изменений',
    raw: '4601234567890',
    expected: '4601234567890',
  },
  {
    name: 'EAN-8 остаётся 8 цифр, не EAN-13-only',
    raw: '01234565',
    expected: '01234565',
  },
  {
    name: 'UPC-A дополняется ведущим нулём до EAN-13',
    raw: '123456789012',
    expected: '0123456789012',
  },
  {
    name: 'GTIN-14 с ведущим нулём сворачивается до EAN-13',
    raw: '04601234567890',
    expected: '4601234567890',
  },
  {
    name: 'GTIN-14 без ведущего нуля сохраняет 14 цифр',
    raw: '14601234567890',
    expected: '14601234567890',
  },
  {
    name: 'GS1 Data Matrix ]d2 + AI 01 извлекает GTIN',
    raw: ']d20104601234567890',
    expected: '4601234567890',
  },
  {
    name: 'GS1-128 ]C1 + AI 01 извлекает GTIN',
    raw: ']C10104601234567890',
    expected: '4601234567890',
  },
  {
    name: 'FNC1 + AI 01 извлекает GTIN',
    raw: `${FNC1}0104601234567890`,
    expected: '4601234567890',
  },
  {
    name: 'GS1 payload с хвостовыми AI берёт только GTIN',
    raw: ']d201046012345678901725010110ABC',
    expected: '4601234567890',
  },
  {
    name: 'Нецелевой scan не маскируется под цифры',
    raw: '460ABC',
    expected: '460ABC',
  },
]

const errors = []

for (const item of cases) {
  const actual = normalizeBarcode(item.raw)
  if (actual !== item.expected) {
    errors.push(`${item.name}: ${JSON.stringify(item.raw)} -> ${JSON.stringify(actual)}, expected ${JSON.stringify(item.expected)}`)
  }
}

const lengths = new Set(
  cases
    .map((item) => item.expected)
    .filter((value) => /^\d+$/.test(value))
    .map((value) => value.length),
)
for (const length of [8, 13, 14]) {
  if (!lengths.has(length)) {
    errors.push(`accepted barcode coverage must include ${length}-digit normalized values`)
  }
}

if (errors.length > 0) {
  console.error(`barcode normalize check failed: ${errors.length} issue(s)`)
  for (const error of errors) console.error(`- ${error}`)
  process.exit(1)
}

console.log(`barcode normalize ok: ${cases.length} cases`)
