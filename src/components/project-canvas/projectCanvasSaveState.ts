import { translate, type AppLocale } from '../../lib/i18n'

export function projectCanvasSavedState(locale: AppLocale, saving: boolean, saveError: string | null): string {
  if (saving) return translate(locale, 'projectCanvas.saving')
  if (saveError) return translate(locale, 'save.error.failed', { error: saveError })
  return translate(locale, 'projectCanvas.saved')
}
