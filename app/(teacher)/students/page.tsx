import { getTranslations } from 'next-intl/server'

export default async function StudentsEmptyPage() {
  const t = await getTranslations('StudentsEmpty')

  return (
    <div>
      <h1>{t('title')}</h1>
      <p className="hint-text">{t('body')}</p>
    </div>
  )
}
