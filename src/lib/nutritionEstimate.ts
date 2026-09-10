import type { Food, NutritionEstimate, QuickAddData } from '../types/calorie'

export function estimateSourceLabel(estimate: NutritionEstimate): string {
  switch (estimate.source) {
    case 'ai':
      return 'AI'
    case 'barcode':
      return estimate.dataSource ?? 'штрих-код'
    case 'library':
      return estimate.dataSource ?? 'продукт'
    case 'manual':
      return estimate.dataSource ?? 'ручной ввод'
  }
}

export function estimateBasisLabel(estimate: NutritionEstimate): string {
  if (estimate.basisLabel) return estimate.basisLabel
  switch (estimate.portionBasis) {
    case 'stated_weight':
      return 'вес указан'
    case 'visual_anchor':
      return 'масштаб по фото'
    case 'label':
      return 'этикетка'
    case 'typical_portion':
      return 'типовая порция'
    case 'user_edit':
      return 'ручная правка'
    case 'unknown':
    case undefined:
      return ''
  }
}

function estimateBrandDataShort(estimate: NutritionEstimate): string {
  switch (estimate.brandDataStatus) {
    case 'exact':
      return 'бренд: точные данные'
    case 'estimated':
      return 'бренд: оценка'
    case 'not_provided':
    case undefined:
      return ''
  }
}

function estimateBrandDataDisclosure(estimate: NutritionEstimate): string {
  const label = estimate.brandDataLabel?.trim()
  switch (estimate.brandDataStatus) {
    case 'exact':
      return label ? `точные данные бренда: ${label}` : 'точные данные бренда использованы'
    case 'estimated':
      return label || 'точные данные бренда не подтверждены, это оценка'
    case 'not_provided':
    case undefined:
      return ''
  }
}

export function estimateShortLine(estimate: NutritionEstimate): string {
  const base = estimateBaseLine(estimate)
  const brand = estimateBrandDataShort(estimate)
  return [base, brand].filter(Boolean).join(' · ')
}

function estimateBaseLine(estimate: NutritionEstimate): string {
  const confidence = typeof estimate.confidence === 'number'
    ? `${Math.round(estimate.confidence * 100)}%`
    : ''
  const basis = estimateBasisLabel(estimate)
  return [estimateSourceLabel(estimate), confidence, basis].filter(Boolean).join(' · ')
}

export function estimateDisclosure(estimate: NutritionEstimate): string {
  if (estimate.source === 'barcode') {
    return `${estimate.dataSource ?? 'штрих-код'} · данные из открытой базы, проверь этикетку`
  }
  const brand = estimateBrandDataDisclosure(estimate)
  return [estimateBaseLine(estimate), brand].filter(Boolean).join(' · ')
}

export function foodSourceLine(food: Food): string {
  if (food.estimate) return estimateShortLine(food.estimate)
  if (food.barcode) return 'штрих-код'
  return 'ручной ввод'
}

export function quickAddSourceLine(quickAdd: QuickAddData): string {
  return quickAdd.estimate ? estimateShortLine(quickAdd.estimate) : ''
}

export function isLowConfidenceEstimate(estimate?: NutritionEstimate): boolean {
  if (estimate?.portionBasis === 'user_edit') return false
  return estimate?.source === 'ai' &&
    typeof estimate.confidence === 'number' &&
    estimate.confidence < 0.8
}
